import { Injectable } from '@nestjs/common';

import { TraceRepository } from './trace.repository';
import type { TraceEventType as PersistedTraceEventType } from './types';
import {
  TraceEventLevel,
  TraceEventPayload,
  TraceEventType,
} from '@shipsec/shared';

@Injectable()
export class TraceService {
  constructor(private readonly repository: TraceRepository) {}

  async list(runId: string): Promise<{ events: TraceEventPayload[]; cursor?: string }> {
    const records = await this.repository.listByRunId(runId);
    const events = records.map((record) => this.mapRecordToEvent(record));
    const cursor = events.length > 0 ? events[events.length - 1].id : undefined;
    return { events, cursor };
  }

  private mapRecordToEvent(record: {
    runId: string;
    nodeRef: string;
    timestamp: Date;
    type: PersistedTraceEventType;
    message: string | null;
    error: string | null;
    outputSummary: unknown | null;
    sequence: number;
  }): TraceEventPayload {
    const type = this.mapEventType(record.type);
    const level = this.mapEventLevel(type, record);

    return {
      id: record.sequence.toString(),
      runId: record.runId,
      nodeId: record.nodeRef,
      type,
      level,
      timestamp: record.timestamp.toISOString(),
      message: record.message ?? undefined,
      error: record.error ? { message: record.error } : undefined,
      outputSummary: record.outputSummary ?? undefined,
      data: undefined,
    };
  }

  private mapEventType(type: PersistedTraceEventType): TraceEventType {
    switch (type) {
      case 'NODE_STARTED':
        return 'STARTED';
      case 'NODE_COMPLETED':
        return 'COMPLETED';
      case 'NODE_FAILED':
        return 'FAILED';
      case 'NODE_PROGRESS':
      default:
        return 'PROGRESS';
    }
  }

  private mapEventLevel(
    type: TraceEventType,
    record: { message: string | null; error: string | null },
  ): TraceEventLevel {
    if (type === 'FAILED') {
      return 'error';
    }
    if (type === 'PROGRESS' && record.message?.toLowerCase().includes('retry')) {
      return 'warn';
    }
    return 'info';
  }
}
