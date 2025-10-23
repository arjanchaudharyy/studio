import { describe, expect, it, vi } from 'bun:test';

const generateTextMock = vi.fn(async () => ({
  text: 'gemini response',
  finishReason: 'stop',
  response: { id: 'resp' },
  usage: { promptTokens: 10, completionTokens: 12 },
}));

const createGeminiMock = vi.fn(() => (model: string) => ({ model }));

vi.mock('ai', () => ({
  generateText: generateTextMock,
}));

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: createGeminiMock,
}));

import { componentRegistry, type ExecutionContext } from '@shipsec/component-sdk';

import '../gemini-chat';

describe('core.gemini.chat component', () => {
  it('resolves API key from secrets and calls the provider', async () => {
    const definition = componentRegistry.get<any, any>('core.gemini.chat');
    expect(definition).toBeDefined();

    const secretsGet = vi.fn().mockResolvedValue({ value: 'gm-secret-from-store', version: 1 });
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
    createGeminiMock.mockClear();

    const result = await definition!.execute(
      {
        systemPrompt: '',
        userPrompt: 'Explain the status.',
        model: 'gemini-2.5-flash',
        temperature: 0.7,
        maxTokens: 512,
        apiBaseUrl: '',
        apiKey: '9b4ce843-4c0a-4d6c-9a27-123456789abc',
      },
      context,
    );

    expect(secretsGet).toHaveBeenCalledWith('9b4ce843-4c0a-4d6c-9a27-123456789abc');
    expect(createGeminiMock).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'gm-secret-from-store' }),
    );
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Explain the status.',
        temperature: 0.7,
        maxTokens: 512,
      }),
    );
    expect(result.chatModel).toEqual(
      expect.objectContaining({
        provider: 'gemini',
        modelId: 'gemini-2.5-flash',
        apiKeySecretId: '9b4ce843-4c0a-4d6c-9a27-123456789abc',
      }),
    );
    expect(result.chatModel.apiKey).toBeUndefined();
  });

  it('throws when secret cannot be resolved', async () => {
    const definition = componentRegistry.get<any, any>('core.gemini.chat');
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
          userPrompt: 'Explain the status.',
          model: 'gemini-2.5-flash',
          temperature: 0.7,
          maxTokens: 512,
          apiBaseUrl: '',
          apiKey: 'missing-secret',
        },
        context,
      ),
    ).rejects.toThrow(/secret \"missing-secret\" was not found/i);
  });
});
