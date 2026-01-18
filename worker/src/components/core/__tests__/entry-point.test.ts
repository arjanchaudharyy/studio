import { describe, it, expect, beforeAll } from 'bun:test';
import { createExecutionContext } from '@shipsec/component-sdk';
import { componentRegistry } from '../../index';
import type { EntryPointInput, EntryPointOutput } from '../entry-point';

describe('entry-point component', () => {
  beforeAll(async () => {
    await import('../../index');
  });

  it('should be registered', () => {
    const component = componentRegistry.get<EntryPointInput, EntryPointOutput>('core.workflow.entrypoint');
    expect(component).toBeDefined();
    expect(component!.label).toBe('Entry Point');
    expect(component!.category).toBe('input');
  });

  it('should map runtime inputs to outputs', async () => {
    const component = componentRegistry.get<EntryPointInput, EntryPointOutput>('core.workflow.entrypoint');
    if (!component) throw new Error('Component not registered');

    const context = createExecutionContext({
      runId: 'test-run',
      componentRef: 'trigger-test',
    });

    const executePayload = {
      inputs: {
        __runtimeData: {
          user: 'alice',
          action: 'start',
          metadata: { source: 'unit-test' },
        },
      },
      params: {
        runtimeInputs: [
          { id: 'user', label: 'User', type: 'text', required: true },
          { id: 'action', label: 'Action', type: 'text', required: true },
          { id: 'metadata', label: 'Metadata', type: 'json', required: false },
        ],
      }
    };

    const result = await component.execute(executePayload, context);

    expect(result).toEqual({
      user: 'alice',
      action: 'start',
      metadata: { source: 'unit-test' },
    });
  });

  it('should normalise legacy string runtime input types', async () => {
    const component = componentRegistry.get('core.workflow.entrypoint');
    if (!component) throw new Error('Component not registered');

    const context = createExecutionContext({
      runId: 'test-run',
      componentRef: 'trigger-test',
    });

    const executePayload = {
      inputs: {
        __runtimeData: {
          legacy: 'hello',
        },
      },
      params: {
        runtimeInputs: [
          { id: 'legacy', label: 'Legacy Text', type: 'string', required: true },
        ],
      }
    };

    const result = await component.execute(executePayload, context) as any;

    expect(result).toEqual({
      legacy: 'hello',
    });
  });

  it('should handle empty runtime input configuration', async () => {
    const component = componentRegistry.get<EntryPointInput, EntryPointOutput>('core.workflow.entrypoint');
    if (!component) throw new Error('Component not registered');

    const context = createExecutionContext({
      runId: 'test-run',
      componentRef: 'trigger-test',
    });

    const executePayload = {
      inputs: {},
      params: {}
    };

    const result = await component.execute(executePayload, context);

    expect(result).toEqual({});
  });

  it('should throw when required runtime input is missing', async () => {
    const component = componentRegistry.get<EntryPointInput, EntryPointOutput>('core.workflow.entrypoint');
    if (!component) throw new Error('Component not registered');

    const context = createExecutionContext({
      runId: 'test-run',
      componentRef: 'trigger-test',
    });

    const executePayload = {
      inputs: {
        __runtimeData: {},
      },
      params: {
        runtimeInputs: [
          { id: 'user', label: 'User', type: 'text', required: true },
        ],
      }
    };

    await expect(component.execute(executePayload, context)).rejects.toThrow(
      "Required runtime input 'User' (user) was not provided",
    );
  });

  it('should handle secret runtime inputs', async () => {
    const component = componentRegistry.get<EntryPointInput, EntryPointOutput>('core.workflow.entrypoint');
    if (!component) throw new Error('Component not registered');

    const context = createExecutionContext({
      runId: 'test-run',
      componentRef: 'trigger-test',
    });

    const params = component.inputSchema.parse({
      runtimeInputs: [
        { id: 'apiKey', label: 'API Key', type: 'secret', required: true },
        { id: 'token', label: 'Token', type: 'secret', required: false },
      ],
      __runtimeData: {
        apiKey: 'super-secret-key',
        token: 'optional-token',
      },
    });

    const result = await component.execute(params, context);

    expect(result).toEqual({
      apiKey: 'super-secret-key',
      token: 'optional-token',
    });
  });

  it('should resolve secret ports correctly', () => {
    const component = componentRegistry.get<EntryPointInput, EntryPointOutput>('core.workflow.entrypoint');
    if (!component) throw new Error('Component not registered');

    const params = {
      runtimeInputs: [
        { id: 'apiKey', label: 'API Key', type: 'secret', required: true },
      ],
    };

    const ports = component.resolvePorts?.(params as any);
    expect(ports).toBeDefined();
    expect(ports!.outputs).toHaveLength(1);
    expect(ports!.outputs[0].id).toBe('apiKey');
    expect(ports!.outputs[0].dataType.kind).toBe('primitive');
    expect((ports!.outputs[0].dataType as any).name).toBe('secret');
  });
});
