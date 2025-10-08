import { spawn } from 'node:child_process';

import { ExecutionContext, RunnerConfig } from './types';

export async function runComponentInline<I, O>(
  execute: (params: I, context: ExecutionContext) => Promise<O>,
  params: I,
  context: ExecutionContext,
) {
  return execute(params, context);
}

export async function runComponentWithRunner<I, O>(
  runner: RunnerConfig,
  execute: (params: I, context: ExecutionContext) => Promise<O>,
  params: I,
  context: ExecutionContext,
): Promise<O> {
  switch (runner.kind) {
    case 'inline':
      return runComponentInline(execute, params, context);
    case 'docker':
      context.logger.info(
        `[Runner] docker execution stub for image ${runner.image}`,
      );
      context.emitProgress('Docker execution not yet implemented; returning inline output');
      return runComponentInline(execute, params, context);
    case 'remote':
      context.logger.info(`[Runner] remote execution stub for ${runner.endpoint}`);
      context.emitProgress('Remote execution not yet implemented; returning inline output');
      return runComponentInline(execute, params, context);
    default:
      throw new Error(`Unsupported runner type ${(runner as any).kind}`);
  }
}
