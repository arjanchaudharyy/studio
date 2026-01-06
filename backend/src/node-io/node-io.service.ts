import { Injectable, Logger } from '@nestjs/common';
import { NodeIORepository } from './node-io.repository';
import { StorageService } from '../storage/storage.service';
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
  private readonly logger = new Logger(NodeIOService.name);

  constructor(
    private readonly repository: NodeIORepository,
    private readonly storage: StorageService,
  ) {}

  /**
   * Get summaries of all node I/O for a run (without full data)
   */
  async listSummaries(runId: string, organizationId?: string | null): Promise<NodeIOSummary[]> {
    const records = await this.repository.listByRunId(runId, organizationId);
    return records.map((r) => this.toSummary(r));
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
    return Promise.all(records.map((r) => this.toDetail(r)));
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

  private async toDetail(record: NodeIORecord): Promise<NodeIODetail> {
    let inputs = record.inputs ?? null;
    let outputs = record.outputs ?? null;

    if (record.inputsSpilled && record.inputsStorageRef) {
      try {
        const buffer = await this.storage.downloadFile(record.inputsStorageRef);
        inputs = JSON.parse(buffer.toString('utf8'));
      } catch (err) {
        this.logger.error(`Failed to fetch spilled inputs from ${record.inputsStorageRef}`, err);
        inputs = { _error: 'Failed to fetch spilled data', _ref: record.inputsStorageRef };
      }
    }

    if (record.outputsSpilled && record.outputsStorageRef) {
      try {
        const buffer = await this.storage.downloadFile(record.outputsStorageRef);
        outputs = JSON.parse(buffer.toString('utf8'));
      } catch (err) {
        this.logger.error(`Failed to fetch spilled outputs from ${record.outputsStorageRef}`, err);
        outputs = { _error: 'Failed to fetch spilled data', _ref: record.outputsStorageRef };
      }
    }

    return {
      nodeRef: record.nodeRef,
      componentId: record.componentId,
      status: record.status as 'running' | 'completed' | 'failed' | 'skipped',
      startedAt: record.startedAt?.toISOString() ?? null,
      completedAt: record.completedAt?.toISOString() ?? null,
      durationMs: record.durationMs,
      inputs,
      outputs,
      inputsSize: record.inputsSize,
      outputsSize: record.outputsSize,
      inputsSpilled: record.inputsSpilled,
      outputsSpilled: record.outputsSpilled,
      errorMessage: record.errorMessage,
    };
  }
}
