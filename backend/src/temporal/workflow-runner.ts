import { componentRegistry } from '../components/registry';
import { createDefaultExecutionContext } from '../components/context';
import { WorkflowDefinition } from '../dsl/types';

export interface WorkflowRunRequest {
  inputs?: Record<string, unknown>;
}

export interface WorkflowRunResult {
  outputs: Record<string, unknown>;
}

export async function executeWorkflow(
  definition: WorkflowDefinition,
  request: WorkflowRunRequest = {},
): Promise<WorkflowRunResult> {
  const results = new Map<string, unknown>();

  for (const action of definition.actions) {
    const component = componentRegistry.get(action.componentId);
    if (!component) {
      throw new Error(`Component not registered: ${action.componentId}`);
    }

    const params = { ...action.params } as Record<string, unknown>;
    if (definition.entrypoint.ref === action.ref && request.inputs) {
      Object.assign(params, request.inputs);
    }

    const parsedParams = component.inputSchema.parse(params);
    const context = createDefaultExecutionContext(action.ref);
    const output = await component.execute(parsedParams, context);
    results.set(action.ref, output);
  }

  const outputsObject: Record<string, unknown> = {};
  results.forEach((value, key) => {
    outputsObject[key] = value;
  });

  return { outputs: outputsObject };
}
