import { randomUUID } from 'node:crypto';

import { componentRegistry } from '../components/registry';
import { createDefaultExecutionContext } from '../components/context';
import { runComponentWithRunner } from '../components/runner';
import { traceCollector } from '../trace/collector';
import { WorkflowDefinition } from '../dsl/types';

export interface WorkflowRunRequest {
  inputs?: Record<string, unknown>;
}

export interface WorkflowRunResult {
  runId: string;
  outputs: Record<string, unknown>;
}

interface ExecuteWorkflowOptions {
  runId?: string;
  services?: Record<string, unknown>;
}

export type { ExecuteWorkflowOptions };

export async function executeWorkflow(
  definition: WorkflowDefinition,
  request: WorkflowRunRequest = {},
  options: ExecuteWorkflowOptions = {},
): Promise<WorkflowRunResult> {
  const runId = options.runId ?? randomUUID();
  const results = new Map<string, unknown>();

  for (const action of definition.actions) {
    const component = componentRegistry.get(action.componentId);
    if (!component) {
      throw new Error(`Component not registered: ${action.componentId}`);
    }

    traceCollector.record({
      type: 'NODE_STARTED',
      runId,
      nodeRef: action.ref,
      timestamp: new Date().toISOString(),
    });

    const params = { ...action.params } as Record<string, unknown>;
    if (definition.entrypoint.ref === action.ref && request.inputs) {
      Object.assign(params, request.inputs);
    }

    const parsedParams = component.inputSchema.parse(params);
    const context = createDefaultExecutionContext(runId, action.ref, options.services);
    try {
      const output = await runComponentWithRunner(
        component.runner,
        component.execute,
        parsedParams,
        context,
      );
      results.set(action.ref, output);

      traceCollector.record({
        type: 'NODE_COMPLETED',
        runId,
        nodeRef: action.ref,
        timestamp: new Date().toISOString(),
        outputSummary: output,
      });
    } catch (error) {
      traceCollector.record({
        type: 'NODE_FAILED',
        runId,
        nodeRef: action.ref,
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  const outputsObject: Record<string, unknown> = {};
  results.forEach((value, key) => {
    outputsObject[key] = value;
  });

  return { runId, outputs: outputsObject };
}
