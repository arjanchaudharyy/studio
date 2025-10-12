import { randomUUID } from 'node:crypto';
import {
  componentRegistry,
  createExecutionContext,
  runComponentWithRunner,
  type IFileStorageService,
  type ISecretsService,
  type IArtifactService,
  type ITraceService,
} from '@shipsec/component-sdk';
import type { WorkflowDefinition, WorkflowRunRequest, WorkflowRunResult } from './types';

export interface ExecuteWorkflowOptions {
  runId?: string;
  storage?: IFileStorageService;
  secrets?: ISecretsService;
  artifacts?: IArtifactService;
  trace?: ITraceService;
}

/**
 * Execute a workflow definition using the component registry
 * Services are injected as SDK interfaces (not concrete implementations)
 */
export async function executeWorkflow(
  definition: WorkflowDefinition,
  request: WorkflowRunRequest = {},
  options: ExecuteWorkflowOptions = {},
): Promise<WorkflowRunResult> {
  const runId = options.runId ?? randomUUID();
  const results = new Map<string, unknown>();

  try {
    for (const action of definition.actions) {
      const component = componentRegistry.get(action.componentId);
      if (!component) {
        throw new Error(`Component not registered: ${action.componentId}`);
      }

      // Record trace event
      options.trace?.record({
        type: 'NODE_STARTED',
        runId,
        nodeRef: action.ref,
        timestamp: new Date().toISOString(),
      });

      // Merge params with inputs for entrypoint
      const params = { ...action.params } as Record<string, unknown>;
      if (definition.entrypoint.ref === action.ref && request.inputs) {
        // For Manual Trigger, pass runtime inputs in __runtimeData key
        if (action.componentId === 'core.trigger.manual') {
          params.__runtimeData = request.inputs;
        } else {
          // For other components, merge directly
          Object.assign(params, request.inputs);
        }
      }

      const parsedParams = component.inputSchema.parse(params);
      
      // Create execution context with SDK interfaces
      const context = createExecutionContext({
        runId,
        componentRef: action.ref,
        storage: options.storage,
        secrets: options.secrets,
        artifacts: options.artifacts,
        trace: options.trace,
      });

      try {
        const output = await runComponentWithRunner(
          component.runner,
          component.execute,
          parsedParams,
          context,
        );
        results.set(action.ref, output);

        options.trace?.record({
          type: 'NODE_COMPLETED',
          runId,
          nodeRef: action.ref,
          timestamp: new Date().toISOString(),
          outputSummary: output,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        options.trace?.record({
          type: 'NODE_FAILED',
          runId,
          nodeRef: action.ref,
          timestamp: new Date().toISOString(),
          error: errorMsg,
        });
        throw error;
      }
    }

    const outputsObject: Record<string, unknown> = {};
    results.forEach((value, key) => {
      outputsObject[key] = value;
    });

    return { outputs: outputsObject, success: true };
  } catch (error) {
    return {
      outputs: {},
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

