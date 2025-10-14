import { Injectable } from '@nestjs/common';

import { TraceRepository } from './trace.repository';
import type { TraceEvent, TraceEventType } from './types';

@Injectable()
export class TraceService {
  constructor(private readonly repository: TraceRepository) {}

  async list(runId: string): Promise<TraceEvent[]> {
    const records = await this.repository.listByRunId(runId);
    return records.map((record) => {
      const base = {
        runId: record.runId,
        nodeRef: record.nodeRef,
        timestamp: record.timestamp.toISOString(),
      };

      return this.mapRecordToEvent(record.type, base, record);
    });
  }

  private mapRecordToEvent(
    type: TraceEventType,
    base: { runId: string; nodeRef: string; timestamp: string },
    record: {
      message: string | null;
      error: string | null;
      outputSummary: unknown | null;
    },
  ): TraceEvent {
    switch (type) {
      case 'NODE_STARTED':
        return { type, ...base };
      case 'NODE_COMPLETED':
        return {
          type,
          ...base,
          ...(record.outputSummary !== null ? { outputSummary: record.outputSummary } : {}),
        };
      case 'NODE_FAILED':
        return {
          type,
          ...base,
          error: record.error ?? 'Unknown error',
        };
      case 'NODE_PROGRESS':
        return {
          type,
          ...base,
          message: record.message ?? '',
        };
      default:
        // Exhaustive guard
        return { type, ...base } as TraceEvent;
    }
  }
}
