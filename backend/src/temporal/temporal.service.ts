import { randomUUID } from 'node:crypto';

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { status as grpcStatus, type ServiceError } from '@grpc/grpc-js';
import Long from 'long';
import {
  Connection,
  WorkflowClient,
  type WorkflowExecutionStatusName,
  type WorkflowHandle,
} from '@temporalio/client';

// Import workflow functions (for type safety during client.start())
// Note: Actual implementation runs in the worker
import { shipsecWorkflowRun, testMinimalWorkflow, minimalWorkflow } from '@shipsec/worker/workflows';

export interface StartWorkflowOptions {
  workflowType: string;
  workflowId?: string;
  taskQueue?: string;
  args?: unknown[];
  memo?: Record<string, unknown>;
  searchAttributes?: Record<string, unknown>;
}

export interface WorkflowRunReference {
  workflowId: string;
  runId?: string;
}

export interface WorkflowStartResult {
  workflowId: string;
  runId: string;
  taskQueue: string;
}

export interface WorkflowRunStatus {
  workflowId: string;
  runId: string;
  status: WorkflowExecutionStatusName;
  startTime: string;
  closeTime?: string;
  historyLength: number;
  taskQueue: string;
}

@Injectable()
export class TemporalService implements OnModuleDestroy {
  private readonly logger = new Logger(TemporalService.name);
  private readonly address: string;
  private readonly namespace: string;
  private readonly defaultTaskQueue: string;
  private clientPromise?: Promise<WorkflowClient>;
  private connection?: Connection;

  constructor(private readonly configService: ConfigService) {
    this.address = this.configService.get<string>('TEMPORAL_ADDRESS', 'localhost:7233');
    this.namespace = this.configService.get<string>('TEMPORAL_NAMESPACE', 'shipsec-dev');
    this.defaultTaskQueue = this.configService.get<string>(
      'TEMPORAL_TASK_QUEUE',
      'shipsec-default',
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.connection) {
      await this.connection.close();
      this.connection = undefined;
      this.clientPromise = undefined;
    }
  }

  async startWorkflow(options: StartWorkflowOptions): Promise<WorkflowStartResult> {
    const client = await this.getClient();
    const workflowId = options.workflowId ?? `shipsec-workflow-${randomUUID()}`;
    const taskQueue = options.taskQueue ?? this.defaultTaskQueue;

    // Map workflow type string to function reference
    const workflowFn = this.getWorkflowFunction(options.workflowType);

    const handle = await client.start(workflowFn, {
      workflowId,
      taskQueue,
      args: (options.args ?? []) as any,
      memo: options.memo,
      searchAttributes: options.searchAttributes as any,
    });

    this.logger.debug(
      `Started Temporal workflow ${handle.workflowId} (run ${handle.firstExecutionRunId})`,
    );

    return {
      workflowId: handle.workflowId,
      runId: handle.firstExecutionRunId,
      taskQueue,
    };
  }

  private getWorkflowFunction(workflowType: string) {
    switch (workflowType) {
      case 'shipsecWorkflowRun':
        return shipsecWorkflowRun;
      case 'testMinimalWorkflow':
        return testMinimalWorkflow;
      case 'minimalWorkflow':
        return minimalWorkflow;
      default:
        throw new Error(`Unknown workflow type: ${workflowType}`);
    }
  }

  async describeWorkflow(ref: WorkflowRunReference): Promise<WorkflowRunStatus> {
    const handle = await this.getWorkflowHandle(ref);
    const description = await handle.describe();
    return {
      workflowId: description.workflowId,
      runId: description.runId,
      status: description.status.name,
      startTime: description.startTime.toISOString(),
      closeTime: description.closeTime?.toISOString(),
      historyLength: description.historyLength,
      taskQueue: description.taskQueue,
    };
  }

  async getWorkflowResult(ref: WorkflowRunReference) {
    const handle = await this.getWorkflowHandle(ref);
    return handle.result();
  }

  async cancelWorkflow(ref: WorkflowRunReference): Promise<void> {
    const handle = await this.getWorkflowHandle(ref);
    await handle.cancel();
  }

  private async getWorkflowHandle(ref: WorkflowRunReference): Promise<WorkflowHandle<any>> {
    const client = await this.getClient();
    return client.getHandle(ref.workflowId, ref.runId);
  }

  getDefaultTaskQueue(): string {
    return this.defaultTaskQueue;
  }

  private async getClient(): Promise<WorkflowClient> {
    if (this.clientPromise) {
      return this.clientPromise;
    }

    this.clientPromise = (async () => {
      try {
        const connection = await Connection.connect({ address: this.address });
        await this.ensureNamespace(connection);
        this.connection = connection;
        return new WorkflowClient({
          connection,
          namespace: this.namespace,
        });
      } catch (error) {
        this.clientPromise = undefined;
        throw error;
      }
    })();

    return this.clientPromise;
  }

  private async ensureNamespace(connection: Connection): Promise<void> {
    try {
      await connection.workflowService.describeNamespace({
        namespace: this.namespace,
      });
    } catch (error) {
      if (!this.isNotFoundError(error)) {
        throw error;
      }

      this.logger.log(`Registering Temporal namespace ${this.namespace}`);
      await connection.workflowService.registerNamespace({
        namespace: this.namespace,
        workflowExecutionRetentionPeriod: { seconds: Long.fromNumber(60 * 60 * 24 * 7) },
      });
    }
  }

  private isNotFoundError(error: unknown): error is ServiceError {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const serviceError = error as ServiceError;
    return serviceError.code === grpcStatus.NOT_FOUND;
  }
}
