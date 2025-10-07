import { Injectable, NotFoundException } from '@nestjs/common';

import { compileWorkflowGraph } from '../dsl/compiler';
import { WorkflowDefinition } from '../dsl/types';
import { executeWorkflow, WorkflowRunRequest, WorkflowRunResult } from '../temporal/workflow-runner';
import { WorkflowGraphDto, WorkflowGraphSchema } from './dto/workflow-graph.dto';
import { WorkflowRecord, WorkflowRepository } from './repository/workflow.repository';

@Injectable()
export class WorkflowsService {
  constructor(private readonly repository: WorkflowRepository) {}

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
    return record;
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }

  async list(): Promise<WorkflowRecord[]> {
    return this.repository.list();
  }

  async commit(id: string): Promise<WorkflowDefinition> {
    const workflow = await this.findById(id);
    const definition = compileWorkflowGraph(workflow.graph);
    await this.repository.saveCompiledDefinition(id, definition);
    return definition;
  }

  async run(id: string, request: WorkflowRunRequest = {}): Promise<WorkflowRunResult> {
    const workflow = await this.findById(id);
    const definition =
      workflow.compiledDefinition ?? (await this.commit(id));
    const result = await executeWorkflow(definition, request);
    return result;
  }

  private parse(dto: WorkflowGraphDto) {
    return WorkflowGraphSchema.parse(dto);
  }
}
