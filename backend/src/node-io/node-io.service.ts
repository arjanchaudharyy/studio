import { Injectable } from '@nestjs/common';
import { NodeIORepository } from './node-io.repository';
import type { NodeIORecord } from '../database/schema';

export interface NodeIOSummary {
  nodeRef: string;
  componentId: string;
  status: 'running' | 'completed' | 'failed' | 'skipped';
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  inputsSize: number;
  outputsSize: number;
  inputsSpilled: boolean;
  outputsSpilled: boolean;
  errorMessage: string | null;
}

export interface NodeIODetail {
  nodeRef: string;
  componentId: string;
  status: 'running' | 'completed' | 'failed' | 'skipped';
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  inputs: Record<string, unknown> | null;
  outputs: Record<string, unknown> | null;
  inputsSize: number;
  outputsSize: number;
  inputsSpilled: boolean;
  outputsSpilled: boolean;
  errorMessage: string | null;
}

@Injectable()
export class NodeIOService {
  constructor(private readonly repository: NodeIORepository) {}

  /**
   * Get summaries of all node I/O for a run (without full data)
   */
  async listSummaries(runId: string, organizationId?: string | null): Promise<NodeIOSummary[]> {
    const records = await this.repository.listByRunId(runId, organizationId);
    return records.map(this.toSummary);
  }

  /**
   * Get full I/O details for a specific node
   */
  async getNodeIO(runId: string, nodeRef: string): Promise<NodeIODetail | null> {
    const record = await this.repository.findByRunAndNode(runId, nodeRef);
    if (!record) {
      return null;
    }
    return this.toDetail(record);
  }

  /**
   * Get all I/O details for a run
   */
  async listDetails(runId: string, organizationId?: string | null): Promise<NodeIODetail[]> {
    const records = await this.repository.listByRunId(runId, organizationId);
    return records.map(this.toDetail);
  }

  private toSummary(record: NodeIORecord): NodeIOSummary {
    return {
      nodeRef: record.nodeRef,
      componentId: record.componentId,
      status: record.status as 'running' | 'completed' | 'failed' | 'skipped',
      startedAt: record.startedAt?.toISOString() ?? null,
      completedAt: record.completedAt?.toISOString() ?? null,
      durationMs: record.durationMs,
      inputsSize: record.inputsSize,
      outputsSize: record.outputsSize,
      inputsSpilled: record.inputsSpilled,
      outputsSpilled: record.outputsSpilled,
      errorMessage: record.errorMessage,
    };
  }

  private toDetail(record: NodeIORecord): NodeIODetail {
    return {
      nodeRef: record.nodeRef,
      componentId: record.componentId,
      status: record.status as 'running' | 'completed' | 'failed' | 'skipped',
      startedAt: record.startedAt?.toISOString() ?? null,
      completedAt: record.completedAt?.toISOString() ?? null,
      durationMs: record.durationMs,
      inputs: record.inputs ?? null,
      outputs: record.outputs ?? null,
      inputsSize: record.inputsSize,
      outputsSize: record.outputsSize,
      inputsSpilled: record.inputsSpilled,
      outputsSpilled: record.outputsSpilled,
      errorMessage: record.errorMessage,
    };
  }
}
