import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { DRIZZLE_TOKEN } from '../../database/database.module';
import {
  workflowRunsTable,
  type WorkflowRunInsert,
  type WorkflowRunRecord,
} from '../../database/schema';

interface CreateWorkflowRunInput {
  runId: string;
  workflowId: string;
  workflowVersionId: string;
  workflowVersion: number;
  temporalRunId: string;
  totalActions: number;
  organizationId?: string | null;
}

@Injectable()
export class WorkflowRunRepository {
  constructor(
    @Inject(DRIZZLE_TOKEN)
    private readonly db: NodePgDatabase,
  ) {}

  async upsert(input: CreateWorkflowRunInput): Promise<WorkflowRunRecord> {
    const values: WorkflowRunInsert = {
      runId: input.runId,
      workflowId: input.workflowId,
      workflowVersionId: input.workflowVersionId,
      workflowVersion: input.workflowVersion,
      temporalRunId: input.temporalRunId,
      totalActions: input.totalActions,
      updatedAt: new Date(),
      organizationId: input.organizationId ?? null,
    };

    const [record] = await this.db
      .insert(workflowRunsTable)
      .values(values)
      .onConflictDoUpdate({
        target: workflowRunsTable.runId,
        set: {
          workflowId: input.workflowId,
          workflowVersionId: input.workflowVersionId,
          workflowVersion: input.workflowVersion,
          temporalRunId: input.temporalRunId,
          totalActions: input.totalActions,
          updatedAt: new Date(),
          organizationId: input.organizationId ?? null,
        },
      })
      .returning();

    return record;
  }

  async findByRunId(
    runId: string,
    options: { organizationId?: string | null } = {},
  ): Promise<WorkflowRunRecord | undefined> {
    const [record] = await this.db
      .select()
      .from(workflowRunsTable)
      .where(this.buildRunFilter(runId, options.organizationId))
      .limit(1);
    return record;
  }

  async list(options: {
    workflowId?: string;
    status?: string;
    limit?: number;
    organizationId?: string | null;
  } = {}): Promise<WorkflowRunRecord[]> {
    const conditions: any[] = [];
    if (options.workflowId) {
      conditions.push(eq(workflowRunsTable.workflowId, options.workflowId));
    }
    if (options.organizationId) {
      conditions.push(eq(workflowRunsTable.organizationId, options.organizationId));
    }

    const baseQuery = this.db.select().from(workflowRunsTable);
    const query = conditions.length > 0
      ? baseQuery.where(
          conditions.length === 1 ? conditions[0] : and(...(conditions as [any, any, ...any[]])),
        )
      : baseQuery;

    return await query
      .orderBy(workflowRunsTable.createdAt)
      .limit(options.limit ?? 50);
  }

  private buildRunFilter(runId: string, organizationId?: string | null) {
    const base = eq(workflowRunsTable.runId, runId);
    if (!organizationId) {
      return base;
    }
    return and(base, eq(workflowRunsTable.organizationId, organizationId));
  }
}
