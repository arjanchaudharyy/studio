import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UsePipes,
} from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';

import {
  CreateWorkflowRequestDto,
  UpdateWorkflowRequestDto,
  WorkflowGraphDto,
  WorkflowGraphSchema,
} from './dto/workflow-graph.dto';
import { TraceService } from '../trace/trace.service';
import { WorkflowsService } from './workflows.service';

@Controller('workflows')
export class WorkflowsController {
  constructor(
    private readonly workflowsService: WorkflowsService,
    private readonly traceService: TraceService,
  ) {}

  @Post()
  @UsePipes(new ZodValidationPipe(WorkflowGraphSchema))
  async create(@Body() body: CreateWorkflowRequestDto) {
    return this.workflowsService.create(body);
  }

  @Put(':id')
  @UsePipes(new ZodValidationPipe(WorkflowGraphSchema))
  async update(@Param('id') id: string, @Body() body: UpdateWorkflowRequestDto) {
    return this.workflowsService.update(id, body);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.workflowsService.findById(id);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.workflowsService.delete(id);
    return { status: 'deleted', id };
  }

  @Post(':id/commit')
  async commit(@Param('id') id: string) {
    return this.workflowsService.commit(id);
  }

  @Post(':id/run')
  async run(
    @Param('id') id: string,
    @Body() body: { inputs?: Record<string, unknown> } = {},
  ) {
    return this.workflowsService.run(id, body);
  }

  @Get('/runs/:runId/trace')
  async trace(@Param('runId') runId: string) {
    return { runId, events: this.traceService.list(runId) };
  }

  @Get()
  async findAll() {
    return this.workflowsService.list();
  }
}
