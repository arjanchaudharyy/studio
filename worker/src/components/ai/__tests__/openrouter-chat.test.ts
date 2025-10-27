import { describe, it, expect, beforeEach, mock } from 'bun:test';
import '../../index';
import { componentRegistry } from '@shipsec/component-sdk';
import type { ExecutionContext } from '@shipsec/component-sdk';
import { createOpenAI as createOpenAIImpl } from '@ai-sdk/openai';
import type { ToolSet, GenerateTextResult } from 'ai';
import type { CreateOpenAIFn, GenerateTextFn } from '../openrouter-chat';

type GenerateTextParams = Parameters<GenerateTextFn>[0];

const createGenerateTextResult = (): GenerateTextResult<ToolSet, never> => ({
  content: [],
  text: 'openrouter response',
  reasoning: [],
  reasoningText: undefined,
  files: [],
  sources: [],
  toolCalls: [],
  staticToolCalls: [],
  dynamicToolCalls: [],
  toolResults: [],
  staticToolResults: [],
  dynamicToolResults: [],
  finishReason: 'stop',
  usage: {
    inputTokens: 12,
    outputTokens: 18,
    totalTokens: 30,
  },
  totalUsage: {
    inputTokens: 12,
    outputTokens: 18,
    totalTokens: 30,
  },
  warnings: undefined,
  request: {},
  response: {
    id: 'resp',
    timestamp: new Date('2024-01-01T00:00:00Z'),
    modelId: 'openrouter/auto',
    messages: [],
  },
  output: undefined as never,
  providerMetadata: undefined,
  steps: [],
  experimental_output: undefined as never,
});

let generateTextCalls: GenerateTextParams[] = [];
const generateTextMock = (async (args: GenerateTextParams) => {
  generateTextCalls.push(args);
  return createGenerateTextResult();
}) as GenerateTextFn;
const createOpenAIMock = mock<CreateOpenAIFn>((options) => createOpenAIImpl(options));

beforeEach(() => {
  generateTextCalls = [];
  createOpenAIMock.mockClear();
});

describe('core.openrouter.chat component', () => {
  it('resolves API key, applies headers, and calls the provider', async () => {
    const definition = componentRegistry.get<any, any>('core.openrouter.chat');
    expect(definition).toBeDefined();

    const secretsGet = mock(async () => ({ value: 'or-secret-from-store', version: 1 }));
    const context: ExecutionContext = {
      runId: 'test-run',
      componentRef: 'node-1',
      logger: { info: mock(() => {}), error: mock(() => {}) },
      emitProgress: mock(() => {}),
      metadata: { runId: 'test-run', componentRef: 'node-1' },
      secrets: {
        get: secretsGet,
        list: mock(async () => []),
      },
    };

    const result = await (definition!.execute as any)(
      {
        systemPrompt: 'You are helpful.',
        userPrompt: 'Summarise the finding.',
        model: 'meta-llama/llama-3.1-70b-instruct',
        temperature: 0.6,
        maxTokens: 512,
        apiBaseUrl: 'https://openrouter.example/v1',
        apiKey: 'openrouter-secret',
        httpReferer: ' https://studio.shipsec.ai/workflows ',
        appTitle: ' ShipSec Studio Automation ',
      },
      context,
      {
        generateText: generateTextMock,
        createOpenAI: createOpenAIMock,
      },
    );

    expect(secretsGet).toHaveBeenCalledWith('openrouter-secret');
    expect(createOpenAIMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'or-secret-from-store',
        baseURL: 'https://openrouter.example/v1',
        headers: {
          'HTTP-Referer': 'https://studio.shipsec.ai/workflows',
          'X-Title': 'ShipSec Studio Automation',
        },
      }),
    );

    expect(generateTextCalls).toHaveLength(1);
    expect(generateTextCalls[0]).toEqual(
      expect.objectContaining({
        prompt: 'Summarise the finding.',
        system: 'You are helpful.',
        temperature: 0.6,
        maxOutputTokens: 512,
      }),
    );

    expect(result.chatModel).toEqual(
      expect.objectContaining({
        provider: 'openrouter',
        modelId: 'meta-llama/llama-3.1-70b-instruct',
        apiKeySecretId: 'openrouter-secret',
        baseUrl: 'https://openrouter.example/v1',
        headers: {
          'HTTP-Referer': 'https://studio.shipsec.ai/workflows',
          'X-Title': 'ShipSec Studio Automation',
        },
      }),
    );
  });

  it('throws when secret cannot be resolved', async () => {
    const definition = componentRegistry.get<any, any>('core.openrouter.chat');
    expect(definition).toBeDefined();

    const secretsGet = mock(async () => null);
    const context: ExecutionContext = {
      runId: 'test-run',
      componentRef: 'node-1',
      logger: { info: mock(() => {}), error: mock(() => {}) },
      emitProgress: mock(() => {}),
      metadata: { runId: 'test-run', componentRef: 'node-1' },
      secrets: {
        get: secretsGet,
        list: mock(async () => []),
      },
    };

    await expect(
      (definition!.execute as any)(
        {
          systemPrompt: '',
          userPrompt: 'Summarise the finding.',
          model: 'openrouter/auto',
          temperature: 0.7,
          maxTokens: 512,
          apiBaseUrl: '',
          apiKey: 'missing-secret',
          httpReferer: '',
          appTitle: '',
        },
        context,
        {
          generateText: generateTextMock,
          createOpenAI: createOpenAIMock,
        },
      ),
    ).rejects.toThrow(/secret "missing-secret" was not found/i);
  });
});

