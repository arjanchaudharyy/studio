import type { WorkflowDefinition, WorkflowJoinStrategy } from './types';

export class WorkflowSchedulerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkflowSchedulerError';
  }
}

export interface WorkflowSchedulerRunContext {
  joinStrategy: WorkflowJoinStrategy | 'all';
  triggeredBy?: string;
}

export interface WorkflowSchedulerOptions {
  run: (actionRef: string, context: WorkflowSchedulerRunContext) => Promise<void>;
}

interface NodeState {
  strategy: WorkflowJoinStrategy | 'all';
  remaining: number;
  triggered: boolean;
}

interface ReadyItem {
  ref: string;
  context: WorkflowSchedulerRunContext;
}

export async function runWorkflowWithScheduler(
  definition: WorkflowDefinition,
  options: WorkflowSchedulerOptions,
): Promise<void> {
  const { run } = options;
  const dependents = new Map<string, string[]>();
  const nodeStates = new Map<string, NodeState>();

  for (const action of definition.actions) {
    const parents = action.dependsOn ?? [];
    for (const parent of parents) {
      const list = dependents.get(parent) ?? [];
      list.push(action.ref);
      dependents.set(parent, list);
    }

    const metadata = definition.nodes?.[action.ref];
    const joinStrategy = metadata?.joinStrategy ?? 'all';
    const initialRemaining =
      parents.length === 0
        ? 0
        : joinStrategy === 'all'
        ? parents.length
        : 1;

    nodeStates.set(action.ref, {
      strategy: joinStrategy,
      remaining: initialRemaining,
      triggered: parents.length === 0,
    });
  }

  const readyQueue: ReadyItem[] = [];

  for (const [ref, state] of nodeStates.entries()) {
    if (state.remaining === 0) {
      readyQueue.push({ ref, context: { joinStrategy: state.strategy } });
    }
  }

  const totalActions = definition.actions.length;
  let completedActions = 0;

  while (completedActions < totalActions) {
    const batch = readyQueue.splice(0);
    if (batch.length === 0) {
      throw new WorkflowSchedulerError(
        'Workflow scheduler deadlock: no ready actions while workflow still incomplete',
      );
    }

    const finishedRefs = await Promise.all(
      batch.map(async ({ ref, context }) => {
        await run(ref, context);
        return ref;
      }),
    );

    for (const ref of finishedRefs) {
      completedActions += 1;
      const downstream = dependents.get(ref) ?? [];

      for (const dependent of downstream) {
        const state = nodeStates.get(dependent);
        if (!state) {
          continue;
        }

        if (state.strategy === 'all') {
          state.remaining = Math.max(0, state.remaining - 1);
          if (state.remaining === 0) {
            readyQueue.push({
              ref: dependent,
              context: { joinStrategy: state.strategy },
            });
          }
        } else if (!state.triggered) {
          state.triggered = true;
          state.remaining = 0;
          readyQueue.push({
            ref: dependent,
            context: { joinStrategy: state.strategy, triggeredBy: ref },
          });
        }
      }
    }
  }
}
