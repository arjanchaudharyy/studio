import { traceCollector } from '../trace/collector';
import { ExecutionContext } from './types';

export function createDefaultExecutionContext(
  runId: string,
  componentRef: string,
): ExecutionContext {
  return {
    runId,
    componentRef,
    logger: {
      info: (...args: unknown[]) => console.log(`[${componentRef}]`, ...args),
      error: (...args: unknown[]) => console.error(`[${componentRef}]`, ...args),
    },
    emitProgress: (message: string) => {
      console.log(`[${componentRef}] progress: ${message}`);
      traceCollector.record({
        type: 'NODE_PROGRESS',
        runId,
        nodeRef: componentRef,
        timestamp: new Date().toISOString(),
        message,
      });
    },
  };
}
