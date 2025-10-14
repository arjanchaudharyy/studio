import { describe, expect, it } from 'bun:test';

import type { WorkflowTraceRecord } from '../../database/schema';
import { TraceService } from '../trace.service';

class FakeTraceRepository {
  public events: WorkflowTraceRecord[] = [];

  async listByRunId(runId: string): Promise<WorkflowTraceRecord[]> {
    return this.events
      .filter((event) => event.runId === runId)
      .sort((a, b) => a.sequence - b.sequence);
  }
}

describe('TraceService', () => {
  const repository = new FakeTraceRepository();
  const service = new TraceService(repository as any);
  const runId = 'service-run';

  it('maps stored records to trace events', async () => {
    repository.events = [
      {
        id: 1,
        runId,
        workflowId: 'workflow-id',
        type: 'NODE_STARTED',
        nodeRef: 'node-1',
        timestamp: new Date('2025-01-01T00:00:00.000Z'),
        message: null,
        error: null,
        outputSummary: null,
        sequence: 1,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      },
      {
        id: 2,
        runId,
        workflowId: 'workflow-id',
        type: 'NODE_PROGRESS',
        nodeRef: 'node-1',
        timestamp: new Date('2025-01-01T00:00:01.000Z'),
        message: 'Working',
        error: null,
        outputSummary: null,
        sequence: 2,
        createdAt: new Date('2025-01-01T00:00:01.000Z'),
      },
      {
        id: 3,
        runId,
        workflowId: 'workflow-id',
        type: 'NODE_COMPLETED',
        nodeRef: 'node-1',
        timestamp: new Date('2025-01-01T00:00:02.000Z'),
        message: null,
        error: null,
        outputSummary: { ok: true },
        sequence: 3,
        createdAt: new Date('2025-01-01T00:00:02.000Z'),
      },
      {
        id: 4,
        runId,
        workflowId: 'workflow-id',
        type: 'NODE_FAILED',
        nodeRef: 'node-2',
        timestamp: new Date('2025-01-01T00:00:03.000Z'),
        message: null,
        error: 'Oops',
        outputSummary: null,
        sequence: 4,
        createdAt: new Date('2025-01-01T00:00:03.000Z'),
      },
    ];

    const events = await service.list(runId);
    expect(events).toEqual([
      {
        type: 'NODE_STARTED',
        runId,
        nodeRef: 'node-1',
        timestamp: '2025-01-01T00:00:00.000Z',
      },
      {
        type: 'NODE_PROGRESS',
        runId,
        nodeRef: 'node-1',
        timestamp: '2025-01-01T00:00:01.000Z',
        message: 'Working',
      },
      {
        type: 'NODE_COMPLETED',
        runId,
        nodeRef: 'node-1',
        timestamp: '2025-01-01T00:00:02.000Z',
        outputSummary: { ok: true },
      },
      {
        type: 'NODE_FAILED',
        runId,
        nodeRef: 'node-2',
        timestamp: '2025-01-01T00:00:03.000Z',
        error: 'Oops',
      },
    ]);
  });
});
