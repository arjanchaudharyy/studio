import { randomUUID } from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';

import { compileWorkflowGraph } from '../dsl/compiler';
import { WorkflowDefinition } from '../dsl/types';
import {
  TemporalService,
  type WorkflowRunStatus,
} from '../temporal/temporal.service';
import { WorkflowGraphDto, WorkflowGraphSchema } from './dto/workflow-graph.dto';
import { WorkflowRecord, WorkflowRepository } from './repository/workflow.repository';

export interface WorkflowRunRequest {
  inputs?: Record<string, unknown>;
}

export interface WorkflowRunHandle {
  runId: string;
  workflowId: string;
  temporalRunId: string;
  status: WorkflowRunStatus['status'];
  taskQueue: string;
}

const SHIPSEC_WORKFLOW_TYPE = 'shipsecWorkflowRun';

@Injectable()
export class WorkflowsService {
  constructor(
    private readonly repository: WorkflowRepository,
    private readonly temporalService: TemporalService,
  ) {}

  async create(dto: WorkflowGraphDto): Promise<WorkflowRecord> {
    const input = this.parse(dto);
    return this.repository.create(input);
  }

  async update(id: string, dto: WorkflowGraphDto): Promise<WorkflowRecord> {
    const input = this.parse(dto);
    return this.repository.update(id, input);
  }

  async findById(id: string): Promise<WorkflowRecord> {
    const record = await this.repository.findById(id);
    if (!record) {
      throw new NotFoundException(`Workflow ${id} not found`);
    }
    return this.flattenWorkflowGraph(record);
  }

  private flattenWorkflowGraph(record: WorkflowRecord): WorkflowRecord {
    // Flatten graph.{nodes, edges, viewport} to top level for API compatibility
    return {
      ...record,
      nodes: record.graph.nodes,
      edges: record.graph.edges,
      viewport: record.graph.viewport,
    } as WorkflowRecord;
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }

  async list(): Promise<WorkflowRecord[]> {
    const records = await this.repository.list();
    return records.map(r => this.flattenWorkflowGraph(r));
  }

  async commit(id: string): Promise<WorkflowDefinition> {
    const workflow = await this.findById(id);
    const definition = compileWorkflowGraph(workflow.graph);
    await this.repository.saveCompiledDefinition(id, definition);
    return definition;
  }

  async run(id: string, request: WorkflowRunRequest = {}): Promise<WorkflowRunHandle> {
    const workflow = await this.findById(id);
    const definition = workflow.compiledDefinition ?? (await this.commit(id));
    const runId = `shipsec-run-${randomUUID()}`;

    // Track execution stats
    await this.repository.incrementRunCount(id);

    const temporalRun = await this.temporalService.startWorkflow({
      workflowType: SHIPSEC_WORKFLOW_TYPE,
      workflowId: runId,
      args: [
        {
          runId,
          workflowId: workflow.id,
          definition,
          inputs: request.inputs ?? {},
        },
      ],
    });

    return {
      runId,
      workflowId: workflow.id,
      temporalRunId: temporalRun.runId,
      status: 'RUNNING',
      taskQueue: temporalRun.taskQueue,
    };
  }

  async getRunStatus(runId: string, temporalRunId?: string): Promise<WorkflowRunStatus> {
    return this.temporalService.describeWorkflow({ workflowId: runId, runId: temporalRunId });
  }

  async getRunResult(runId: string, temporalRunId?: string) {
    return this.temporalService.getWorkflowResult({ workflowId: runId, runId: temporalRunId });
  }

  async cancelRun(runId: string, temporalRunId?: string): Promise<void> {
    await this.temporalService.cancelWorkflow({ workflowId: runId, runId: temporalRunId });
  }

  private parse(dto: WorkflowGraphDto) {
    return WorkflowGraphSchema.parse(dto);
  }
}
