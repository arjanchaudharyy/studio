import type { ExecutionContext, Logger } from './types';
import type {
  IFileStorageService,
  ISecretsService,
  IArtifactService,
  ITraceService,
} from './interfaces';

export interface CreateContextOptions {
  runId: string;
  componentRef: string;
  storage?: IFileStorageService;
  secrets?: ISecretsService;
  artifacts?: IArtifactService;
  trace?: ITraceService;
}

export function createExecutionContext(options: CreateContextOptions): ExecutionContext {
  const { runId, componentRef, storage, secrets, artifacts, trace } = options;

  const logger: Logger = {
    info: (...args: unknown[]) => console.log(`[${componentRef}]`, ...args),
    error: (...args: unknown[]) => console.error(`[${componentRef}]`, ...args),
  };

  const emitProgress = (message: string) => {
    console.log(`[${componentRef}] progress: ${message}`);
    if (trace) {
      trace.record({
        type: 'NODE_PROGRESS',
        runId,
        nodeRef: componentRef,
        timestamp: new Date().toISOString(),
        message,
      });
    }
  };

  return {
    runId,
    componentRef,
    logger,
    emitProgress,
    storage,
    secrets,
    artifacts,
    trace,
  };
}


