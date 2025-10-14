import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import {
  workflowTracesTable,
  type WorkflowTraceRecord,
} from '../database/schema';
import { DRIZZLE_TOKEN } from '../database/database.module';
import type { TraceEventType } from './types';

export interface PersistedTraceEvent {
  runId: string;
  workflowId?: string;
  type: TraceEventType;
  nodeRef: string;
  timestamp: string;
  sequence: number;
  message?: string;
  error?: string;
  outputSummary?: unknown;
}

@Injectable()
export class TraceRepository {
  constructor(
    @Inject(DRIZZLE_TOKEN)
    private readonly db: NodePgDatabase,
  ) {}

  async append(event: PersistedTraceEvent): Promise<void> {
    await this.db.insert(workflowTracesTable).values(this.mapToInsert(event));
  }

  async appendMany(events: PersistedTraceEvent[]): Promise<void> {
    if (events.length === 0) {
      return;
    }

    await this.db
      .insert(workflowTracesTable)
      .values(events.map((event) => this.mapToInsert(event)));
  }

  async listByRunId(runId: string): Promise<WorkflowTraceRecord[]> {
    return this.db
      .select()
      .from(workflowTracesTable)
      .where(eq(workflowTracesTable.runId, runId))
      .orderBy(workflowTracesTable.sequence);
  }

  private mapToInsert(event: PersistedTraceEvent) {
    return {
      runId: event.runId,
      workflowId: event.workflowId ?? null,
      type: event.type,
      nodeRef: event.nodeRef,
      timestamp: new Date(event.timestamp),
      message: event.message ?? null,
      error: event.error ?? null,
      outputSummary: event.outputSummary ?? null,
      sequence: event.sequence,
    };
  }
}
