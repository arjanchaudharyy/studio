import { Inject, Injectable } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import {
  workflowTracesTable,
  type WorkflowTraceRecord,
} from '../database/schema';
import { DRIZZLE_TOKEN } from '../database/database.module';
import type { TraceEventType } from './types';
import { sql } from 'drizzle-orm';

export interface PersistedTraceEvent {
  runId: string;
  workflowId?: string;
  type: TraceEventType;
  nodeRef: string;
  timestamp: string;
  sequence: number;
  level: string;
  message?: string;
  error?: string;
  outputSummary?: unknown;
  data?: Record<string, unknown> | null;
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

  async countByType(runId: string, type: TraceEventType): Promise<number> {
    const [result] = await this.db
      .select({ value: sql<number>`count(*)` })
      .from(workflowTracesTable)
      .where(
        and(
          eq(workflowTracesTable.runId, runId),
          eq(workflowTracesTable.type, type),
        ),
      );

    return Number(result?.value ?? 0);
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
      level: event.level,
      data: event.data ?? null,
      sequence: event.sequence,
    };
  }
}
