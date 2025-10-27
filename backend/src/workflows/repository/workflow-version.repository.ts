import { Inject, Injectable } from '@nestjs/common';
import { desc, eq, and } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { DRIZZLE_TOKEN } from '../../database/database.module';
import {
  workflowVersionsTable,
  type WorkflowVersionGraph,
  type WorkflowVersionRecord,
} from '../../database/schema';
import { WorkflowDefinition } from '../../dsl/types';

interface CreateWorkflowVersionInput {
  workflowId: string;
  graph: WorkflowVersionGraph;
}

interface FindByWorkflowVersionInput {
  workflowId: string;
  version: number;
}

@Injectable()
export class WorkflowVersionRepository {
  constructor(
    @Inject(DRIZZLE_TOKEN)
    private readonly db: NodePgDatabase,
  ) {}

  async create(input: CreateWorkflowVersionInput): Promise<WorkflowVersionRecord> {
    const latest = await this.findLatestByWorkflowId(input.workflowId);
    const nextVersion = latest ? latest.version + 1 : 1;

    const [record] = await this.db
      .insert(workflowVersionsTable)
      .values({
        workflowId: input.workflowId,
        version: nextVersion,
        graph: input.graph,
      })
      .returning();

    return record;
  }

  async findLatestByWorkflowId(workflowId: string): Promise<WorkflowVersionRecord | undefined> {
    const [record] = await this.db
      .select()
      .from(workflowVersionsTable)
      .where(eq(workflowVersionsTable.workflowId, workflowId))
      .orderBy(desc(workflowVersionsTable.version))
      .limit(1);

    return record;
  }

  async findById(id: string): Promise<WorkflowVersionRecord | undefined> {
    const [record] = await this.db
      .select()
      .from(workflowVersionsTable)
      .where(eq(workflowVersionsTable.id, id))
      .limit(1);

    return record;
  }

  async findByWorkflowAndVersion(
    input: FindByWorkflowVersionInput,
  ): Promise<WorkflowVersionRecord | undefined> {
    const [record] = await this.db
      .select()
      .from(workflowVersionsTable)
      .where(
        and(
          eq(workflowVersionsTable.workflowId, input.workflowId),
          eq(workflowVersionsTable.version, input.version),
        ),
      )
      .limit(1);

    return record;
  }

  async setCompiledDefinition(
    id: string,
    definition: WorkflowDefinition,
  ): Promise<WorkflowVersionRecord | undefined> {
    const [record] = await this.db
      .update(workflowVersionsTable)
      .set({
        compiledDefinition: definition,
      })
      .where(eq(workflowVersionsTable.id, id))
      .returning();

    return record;
  }
}
