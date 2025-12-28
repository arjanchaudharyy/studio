import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { DRIZZLE_TOKEN } from '../database/database.module';
import { type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../database/schema';
import { approvalRequestsTable } from '../database/schema';
import { eq, and, desc } from 'drizzle-orm';
import { TemporalService } from '../temporal/temporal.service';
import { randomUUID } from 'node:crypto';

export type ApprovalRequest = typeof approvalRequestsTable.$inferSelect;
export type ApprovalRequestInsert = typeof approvalRequestsTable.$inferInsert;

export interface CreateApprovalInput {
  runId: string;
  workflowId: string;
  nodeRef: string;
  title: string;
  description?: string;
  context?: Record<string, unknown>;
  timeoutAt?: Date;
  organizationId?: string | null;
}

export interface ResolveApprovalInput {
  approved: boolean;
  respondedBy?: string;
  responseNote?: string;
}

@Injectable()
export class ApprovalsService {
  private readonly logger = new Logger(ApprovalsService.name);

  constructor(
    @Inject(DRIZZLE_TOKEN)
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly temporalService: TemporalService,
  ) {}

  /**
   * Create a new approval request
   */
  async create(input: CreateApprovalInput): Promise<ApprovalRequest> {
    const id = randomUUID();
    const approveToken = this.generateToken();
    const rejectToken = this.generateToken();

    const insertData: ApprovalRequestInsert = {
      id,
      runId: input.runId,
      workflowId: input.workflowId,
      nodeRef: input.nodeRef,
      status: 'pending',
      title: input.title,
      description: input.description ?? null,
      context: input.context ?? {},
      approveToken,
      rejectToken,
      timeoutAt: input.timeoutAt ?? null,
      organizationId: input.organizationId ?? null,
    };

    await this.db.insert(approvalRequestsTable).values(insertData);

    this.logger.log(`Created approval request ${id} for run ${input.runId}, node ${input.nodeRef}`);

    const [record] = await this.db
      .select()
      .from(approvalRequestsTable)
      .where(eq(approvalRequestsTable.id, id))
      .limit(1);

    return record;
  }

  /**
   * Find an approval by ID
   */
  async findById(id: string): Promise<ApprovalRequest | null> {
    const [record] = await this.db
      .select()
      .from(approvalRequestsTable)
      .where(eq(approvalRequestsTable.id, id))
      .limit(1);

    return record ?? null;
  }

  /**
   * Find an approval by approve token
   */
  async findByApproveToken(token: string): Promise<ApprovalRequest | null> {
    const [record] = await this.db
      .select()
      .from(approvalRequestsTable)
      .where(eq(approvalRequestsTable.approveToken, token))
      .limit(1);

    return record ?? null;
  }

  /**
   * Find an approval by reject token
   */
  async findByRejectToken(token: string): Promise<ApprovalRequest | null> {
    const [record] = await this.db
      .select()
      .from(approvalRequestsTable)
      .where(eq(approvalRequestsTable.rejectToken, token))
      .limit(1);

    return record ?? null;
  }

  /**
   * List pending approvals for an organization
   */
  async listPending(organizationId: string | null): Promise<ApprovalRequest[]> {
    if (organizationId) {
      return this.db
        .select()
        .from(approvalRequestsTable)
        .where(
          and(
            eq(approvalRequestsTable.status, 'pending'),
            eq(approvalRequestsTable.organizationId, organizationId),
          ),
        )
        .orderBy(desc(approvalRequestsTable.createdAt));
    }

    return this.db
      .select()
      .from(approvalRequestsTable)
      .where(eq(approvalRequestsTable.status, 'pending'))
      .orderBy(desc(approvalRequestsTable.createdAt));
  }

  /**
   * List all approvals for an organization
   */
  async list(organizationId: string | null): Promise<ApprovalRequest[]> {
    if (organizationId) {
      return this.db
        .select()
        .from(approvalRequestsTable)
        .where(eq(approvalRequestsTable.organizationId, organizationId))
        .orderBy(desc(approvalRequestsTable.createdAt));
    }

    return this.db
      .select()
      .from(approvalRequestsTable)
      .orderBy(desc(approvalRequestsTable.createdAt));
  }

  /**
   * Resolve an approval (approve or reject)
   */
  async resolve(id: string, input: ResolveApprovalInput): Promise<ApprovalRequest> {
    const approval = await this.findById(id);
    if (!approval) {
      throw new NotFoundException(`Approval request ${id} not found`);
    }

    if (approval.status !== 'pending') {
      throw new BadRequestException(`Approval request ${id} is already ${approval.status}`);
    }

    // Check if timeout has passed
    if (approval.timeoutAt && new Date() > approval.timeoutAt) {
      await this.db
        .update(approvalRequestsTable)
        .set({
          status: 'expired',
          updatedAt: new Date(),
        })
        .where(eq(approvalRequestsTable.id, id));
      throw new BadRequestException(`Approval request ${id} has expired`);
    }

    const now = new Date();
    const newStatus = input.approved ? 'approved' : 'rejected';

    // Update the approval record
    await this.db
      .update(approvalRequestsTable)
      .set({
        status: newStatus,
        respondedAt: now,
        respondedBy: input.respondedBy ?? null,
        responseNote: input.responseNote ?? null,
        updatedAt: now,
      })
      .where(eq(approvalRequestsTable.id, id));

    this.logger.log(
      `Resolved approval ${id}: ${newStatus} by ${input.respondedBy ?? 'unknown'}`,
    );

    // Send signal to Temporal workflow to resume
    try {
      await this.temporalService.signalApproval({
        workflowId: approval.runId, // The workflow ID is the run ID
        approvalId: id,
        nodeRef: approval.nodeRef,
        approved: input.approved,
        respondedBy: input.respondedBy,
        responseNote: input.responseNote,
        respondedAt: now.toISOString(),
      });
      this.logger.log(`Sent approval signal to workflow ${approval.runId}`);
    } catch (error) {
      this.logger.error(
        `Failed to send approval signal to workflow ${approval.runId}: ${error}`,
      );
      // Don't throw - the approval was still recorded
    }

    // Fetch updated record
    const [updated] = await this.db
      .select()
      .from(approvalRequestsTable)
      .where(eq(approvalRequestsTable.id, id))
      .limit(1);

    return updated;
  }

  /**
   * Resolve via approve token (for public links)
   */
  async resolveByApproveToken(
    token: string,
    input: Omit<ResolveApprovalInput, 'approved'>,
  ): Promise<ApprovalRequest> {
    const approval = await this.findByApproveToken(token);
    if (!approval) {
      throw new NotFoundException('Invalid approval token');
    }

    return this.resolve(approval.id, { ...input, approved: true });
  }

  /**
   * Resolve via reject token (for public links)
   */
  async resolveByRejectToken(
    token: string,
    input: Omit<ResolveApprovalInput, 'approved'>,
  ): Promise<ApprovalRequest> {
    const approval = await this.findByRejectToken(token);
    if (!approval) {
      throw new NotFoundException('Invalid rejection token');
    }

    return this.resolve(approval.id, { ...input, approved: false });
  }

  /**
   * Cancel an approval (e.g., when workflow is terminated)
   */
  async cancel(id: string): Promise<void> {
    await this.db
      .update(approvalRequestsTable)
      .set({
        status: 'cancelled',
        updatedAt: new Date(),
      })
      .where(eq(approvalRequestsTable.id, id));
  }

  private generateToken(): string {
    return `${randomUUID()}-${Date.now().toString(36)}`;
  }
}
