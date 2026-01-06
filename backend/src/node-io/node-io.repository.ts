import { Inject, Injectable } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { nodeIOTable, type NodeIORecord, type NodeIOInsert } from '../database/schema';
import { DRIZZLE_TOKEN } from '../database/database.module';

export interface NodeIOData {
  runId: string;
  nodeRef: string;
  workflowId?: string;
  organizationId?: string | null;
  componentId: string;
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  startedAt?: Date;
  completedAt?: Date;
  status: 'running' | 'completed' | 'failed' | 'skipped';
  errorMessage?: string;
}

// Size threshold for spilling to object storage (100KB)
const SPILL_THRESHOLD_BYTES = 100 * 1024;

@Injectable()
export class NodeIORepository {
  constructor(
    @Inject(DRIZZLE_TOKEN)
    private readonly db: NodePgDatabase,
  ) {}

  /**
   * Record node execution start (inputs captured)
   */
  async recordStart(data: {
    runId: string;
    nodeRef: string;
    workflowId?: string;
    organizationId?: string | null;
    componentId: string;
    inputs?: Record<string, unknown>;
  }): Promise<void> {
    const inputsJson = data.inputs ? JSON.stringify(data.inputs) : null;
    const inputsSize = inputsJson ? Buffer.byteLength(inputsJson, 'utf8') : 0;
    const inputsSpilled = inputsSize > SPILL_THRESHOLD_BYTES;

    const insert: NodeIOInsert = {
      runId: data.runId,
      nodeRef: data.nodeRef,
      workflowId: data.workflowId ?? null,
      organizationId: data.organizationId ?? null,
      componentId: data.componentId,
      inputs: inputsSpilled ? { _spilled: true, size: inputsSize } : data.inputs,
      inputsSize,
      inputsSpilled,
      inputsStorageRef: inputsSpilled ? `node-io/${data.runId}/${data.nodeRef}/inputs.json` : null,
      startedAt: new Date(),
      status: 'running',
    };

    await this.db.insert(nodeIOTable).values(insert);

    // TODO: If spilled, actually write to object storage
    // For now we just mark it as spilled but keep inline
    if (inputsSpilled) {
      console.warn(`[NodeIO] Large inputs for ${data.nodeRef} (${inputsSize} bytes) - spilling not yet implemented`);
    }
  }

  /**
   * Update node execution with outputs (completion)
   */
  async recordCompletion(data: {
    runId: string;
    nodeRef: string;
    outputs: Record<string, unknown>;
    status: 'completed' | 'failed' | 'skipped';
    errorMessage?: string;
  }): Promise<void> {
    const outputsJson = JSON.stringify(data.outputs);
    const outputsSize = Buffer.byteLength(outputsJson, 'utf8');
    const outputsSpilled = outputsSize > SPILL_THRESHOLD_BYTES;

    const completedAt = new Date();

    // Get the existing record to calculate duration
    const existing = await this.findByRunAndNode(data.runId, data.nodeRef);
    const durationMs = existing?.startedAt
      ? completedAt.getTime() - new Date(existing.startedAt).getTime()
      : null;

    await this.db
      .update(nodeIOTable)
      .set({
        outputs: outputsSpilled ? { _spilled: true, size: outputsSize } : data.outputs,
        outputsSize,
        outputsSpilled,
        outputsStorageRef: outputsSpilled ? `node-io/${data.runId}/${data.nodeRef}/outputs.json` : null,
        completedAt,
        durationMs,
        status: data.status,
        errorMessage: data.errorMessage ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(nodeIOTable.runId, data.runId),
          eq(nodeIOTable.nodeRef, data.nodeRef),
        ),
      );

    // TODO: If spilled, actually write to object storage
    if (outputsSpilled) {
      console.warn(`[NodeIO] Large outputs for ${data.nodeRef} (${outputsSize} bytes) - spilling not yet implemented`);
    }
  }

  /**
   * Get all node I/O records for a run
   */
  async listByRunId(runId: string, organizationId?: string | null): Promise<NodeIORecord[]> {
    const conditions = [eq(nodeIOTable.runId, runId)];
    if (organizationId) {
      conditions.push(eq(nodeIOTable.organizationId, organizationId));
    }

    return this.db
      .select()
      .from(nodeIOTable)
      .where(and(...conditions))
      .orderBy(nodeIOTable.startedAt);
  }

  /**
   * Get I/O for a specific node in a run
   */
  async findByRunAndNode(runId: string, nodeRef: string): Promise<NodeIORecord | null> {
    const [record] = await this.db
      .select()
      .from(nodeIOTable)
      .where(
        and(
          eq(nodeIOTable.runId, runId),
          eq(nodeIOTable.nodeRef, nodeRef),
        ),
      )
      .limit(1);

    return record ?? null;
  }
}
