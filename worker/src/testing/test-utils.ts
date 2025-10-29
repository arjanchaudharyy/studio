import { vi } from 'bun:test';
import { ExecutionContext, ISecretsService } from '@shipsec/component-sdk';

export function createMockExecutionContext(
  overrides: Partial<ExecutionContext> = {},
): ExecutionContext {
  const defaultSecrets: ISecretsService = {
    get: vi.fn(),
    list: vi.fn(),
  };

  const defaultContext: ExecutionContext = {
    runId: 'test-run-id',
    componentRef: 'test-component-ref',
    logger: {
      info: vi.fn(),
      error: vi.fn(),
    },
    emitProgress: vi.fn(),
    secrets: defaultSecrets,
    // Add other default mock implementations as needed
    storage: undefined,
    artifacts: undefined,
    trace: undefined,
    logCollector: undefined,
    metadata: { runId: 'test-run-id', componentRef: 'test-component-ref' },
  };

  const mergedSecrets: ISecretsService = {
    get: overrides.secrets?.get ?? defaultSecrets.get,
    list: overrides.secrets?.list ?? defaultSecrets.list,
  };

  return {
    ...defaultContext,
    ...overrides,
    logger: { ...defaultContext.logger, ...overrides.logger },
    secrets: mergedSecrets,
  };
}

export function createMockSecretsService(secrets: Record<string, string> = {}): ISecretsService {
  return {
    get: vi.fn().mockImplementation((secretId: string) => {
      const secretValue = secrets[secretId];
      return secretValue ? Promise.resolve({ value: secretValue }) : Promise.resolve(null);
    }),
    list: vi.fn().mockResolvedValue([]),
  };
}

export function createMockTrace(): any {
  const events: any[] = [];
  return {
    record: vi.fn().mockImplementation((event) => {
      events.push(event);
      console.log('TRACE:', event.type, event.nodeRef, event.message);
    }),
    flush: vi.fn().mockResolvedValue(undefined),
    setRunMetadata: vi.fn(),
    finalizeRun: vi.fn(),
    events,
  };
}

export function createMockLogCollector(): any {
  const logs: any[] = [];
  return {
    append: vi.fn().mockImplementation((log) => {
      logs.push(log);
      console.log('LOG:', log.level, log.message);
    }),
    flush: vi.fn().mockResolvedValue(undefined),
    logs,
  };
}
