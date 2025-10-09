import { z } from 'zod';
import type {
  IFileStorageService,
  ISecretsService,
  IArtifactService,
  ITraceService,
} from './interfaces';

export type RunnerKind = 'inline' | 'docker' | 'remote';

export interface InlineRunnerConfig {
  kind: 'inline';
  concurrency?: number;
}

export interface DockerRunnerConfig {
  kind: 'docker';
  image: string;
  command: string[];
  env?: Record<string, string>;
  timeoutSeconds?: number;
}

export interface RemoteRunnerConfig {
  kind: 'remote';
  endpoint: string;
  authSecretName?: string;
}

export type RunnerConfig =
  | InlineRunnerConfig
  | DockerRunnerConfig
  | RemoteRunnerConfig;

export interface Logger {
  info: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

/**
 * Execution context provided to components during execution
 * Contains service interfaces (not concrete implementations)
 */
export interface ExecutionContext {
  runId: string;
  componentRef: string;
  logger: Logger;
  emitProgress: (message: string) => void;
  
  // Service interfaces - implemented by adapters
  storage?: IFileStorageService;
  secrets?: ISecretsService;
  artifacts?: IArtifactService;
  trace?: ITraceService;
}

export interface ComponentDefinition<I = unknown, O = unknown> {
  id: string;
  label: string;
  category: 'trigger' | 'input' | 'discovery' | 'transform' | 'output';
  runner: RunnerConfig;
  inputSchema: z.ZodType<I>;
  outputSchema: z.ZodType<O>;
  docs?: string;
  execute: (params: I, context: ExecutionContext) => Promise<O>;
}


