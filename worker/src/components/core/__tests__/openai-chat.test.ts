import { describe, expect, it, vi } from 'bun:test';

const generateTextMock = vi.fn(async () => ({
  text: 'hello world',
  finishReason: 'stop',
  response: { id: 'resp' },
  usage: { promptTokens: 5, completionTokens: 7 },
}));

const createOpenAIMock = vi.fn(() => (model: string) => ({ model }));

vi.mock('ai', () => ({
  generateText: generateTextMock,
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: createOpenAIMock,
}));

import { componentRegistry, type ExecutionContext } from '@shipsec/component-sdk';

import '../openai-chat';

describe('core.openai.chat component', () => {
  it('resolves API key from secrets and calls the provider', async () => {
    const definition = componentRegistry.get<any, any>('core.openai.chat');
    expect(definition).toBeDefined();

    const secretsGet = vi.fn().mockResolvedValue({ value: 'sk-secret-from-store', version: 1 });
    const context: ExecutionContext = {
      runId: 'test-run',
      componentRef: 'node-1',
      logger: { info: vi.fn(), error: vi.fn() },
      emitProgress: vi.fn(),
      metadata: { runId: 'test-run', componentRef: 'node-1' },
      secrets: {
        get: secretsGet,
        list: vi.fn(async () => []),
      },
    };

    generateTextMock.mockClear();
    createOpenAIMock.mockClear();

    const result = await definition!.execute(
      {
        systemPrompt: 'system prompt',
        userPrompt: 'Hello?',
        model: 'gpt-4o-mini',
        temperature: 0.5,
        maxTokens: 256,
        apiBaseUrl: '',
        apiKey: 'a2e6b4ad-1234-4e4c-b64f-0123456789ab',
      },
      context,
    );

    expect(secretsGet).toHaveBeenCalledWith('a2e6b4ad-1234-4e4c-b64f-0123456789ab');
    expect(createOpenAIMock).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'sk-secret-from-store' }),
    );
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Hello?',
        system: 'system prompt',
        temperature: 0.5,
        maxTokens: 256,
      }),
    );
    expect(result.chatModel).toEqual(
      expect.objectContaining({
        provider: 'openai',
        modelId: 'gpt-4o-mini',
        apiKeySecretId: 'a2e6b4ad-1234-4e4c-b64f-0123456789ab',
      }),
    );
    expect(result.chatModel.apiKey).toBeUndefined();
  });

  it('throws when secret cannot be resolved', async () => {
    const definition = componentRegistry.get<any, any>('core.openai.chat');
    expect(definition).toBeDefined();

    const secretsGet = vi.fn().mockResolvedValue(null);
    const context: ExecutionContext = {
      runId: 'test-run',
      componentRef: 'node-1',
      logger: { info: vi.fn(), error: vi.fn() },
      emitProgress: vi.fn(),
      metadata: { runId: 'test-run', componentRef: 'node-1' },
      secrets: {
        get: secretsGet,
        list: vi.fn(async () => []),
      },
    };

    await expect(
      definition!.execute(
        {
          systemPrompt: '',
          userPrompt: 'Hello',
          model: 'gpt-4o-mini',
          temperature: 0.7,
          maxTokens: 512,
          apiBaseUrl: '',
          apiKey: 'missing-secret',
        },
        context,
      ),
    ).rejects.toThrow(/secret "missing-secret" was not found/i);
  });
});
