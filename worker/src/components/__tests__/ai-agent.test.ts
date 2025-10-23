import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'bun:test';
import { createExecutionContext } from '@shipsec/component-sdk';

const generateTextMock = vi.fn<any>();
const toolMock = vi.fn((config: any) => ({ ...config }));
const openAiFactoryMock = vi.fn((options: any) => (modelId: string) => ({
  provider: 'openai',
  options,
  modelId,
}));
const googleFactoryMock = vi.fn((options: any) => (modelId: string) => ({
  provider: 'gemini',
  options,
  modelId,
}));

const OPENAI_SECRET_ID = 'secret-openai';
const GEMINI_SECRET_ID = 'secret-gemini';

const secretsService = {
  async get(id: string) {
    if (id === OPENAI_SECRET_ID) {
      return { value: 'sk-openai-from-secret', version: 1 };
    }
    if (id === GEMINI_SECRET_ID) {
      return { value: 'gm-gemini-from-secret', version: 1 };
    }
    return null;
  },
  async list() {
    return [OPENAI_SECRET_ID, GEMINI_SECRET_ID];
  },
};

vi.mock('ai', () => ({
  generateText: generateTextMock,
  tool: toolMock,
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: (options: any) => openAiFactoryMock(options),
}));

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: (options: any) => googleFactoryMock(options),
}));

let componentRegistry: any;
let aiAgent: any;
beforeAll(async () => {
  ({ componentRegistry } = await import('../index'));
  aiAgent = componentRegistry.get('core.ai.agent');

  if (!aiAgent) {
    throw new Error('AI agent component failed to register');
  }
});

afterEach(() => {
  generateTextMock.mockReset();
  toolMock.mockClear();
  openAiFactoryMock.mockClear();
  googleFactoryMock.mockClear();
});

describe('core.ai.agent component', () => {
  it('is registered with expected metadata', () => {
    expect(aiAgent.id).toBe('core.ai.agent');
    expect(aiAgent.label).toBe('AI SDK Agent');
    expect(aiAgent.metadata.slug).toBe('ai-agent');
    expect(typeof aiAgent.execute).toBe('function');
  });

  it('invokes the AI SDK and updates conversation state', async () => {
    const runContext = createExecutionContext({
      runId: 'test-run-ai-agent',
      componentRef: 'ai-agent-component',
      secrets: secretsService,
    });

    const params = aiAgent.inputSchema.parse({
      userInput: 'Summarise the latest findings.',
      systemPrompt: 'You are a concise security analyst.',
      memorySize: 5,
      chatModel: {
        provider: 'openai',
        modelId: 'gpt-4o-mini',
        apiKeySecretId: OPENAI_SECRET_ID,
      },
      conversationState: {
        sessionId: 'session-123',
        messages: [
          { role: 'system', content: 'You are a concise security analyst.' },
          { role: 'user', content: 'Previous question?' },
          { role: 'assistant', content: 'Previous response.' },
        ],
        toolInvocations: [],
      },
    });

    generateTextMock.mockResolvedValue({
      text: 'Here is a brief summary.',
      steps: [
        {
          text: 'Evaluating previous context.',
          finishReason: 'stop',
          toolCalls: [],
          toolResults: [],
        },
      ],
      toolResults: [
        {
          toolCallId: 'call-1',
          toolName: 'call_mcp_tool',
          args: { toolName: 'lookup', arguments: { query: 'dns' } },
          result: { payload: 'tool-output' },
        },
      ],
      usage: {
        promptTokens: 64,
        completionTokens: 32,
        totalTokens: 96,
      },
    });

    const result = await aiAgent.execute(params, runContext);

    expect(generateTextMock).toHaveBeenCalledTimes(1);
    const callArgs = generateTextMock.mock.calls[0][0];
    expect(callArgs.messages).toEqual([
      { role: 'user', content: 'Previous question?' },
      { role: 'assistant', content: 'Previous response.' },
      { role: 'user', content: 'Summarise the latest findings.' },
    ]);
    expect(callArgs.system).toBe('You are a concise security analyst.');
    expect(result.responseText).toBe('Here is a brief summary.');
    expect(result.conversationState.sessionId).toBe('session-123');
    expect(result.conversationState.messages.at(-1)).toEqual({
      role: 'assistant',
      content: 'Here is a brief summary.',
    });
    expect(result.toolInvocations).toHaveLength(1);
    expect(result.toolInvocations[0].toolName).toBe('call_mcp_tool');
    expect(result.reasoningTrace[0].thought).toContain('Evaluating previous context.');
    expect(result.usage).toEqual({
      promptTokens: 64,
      completionTokens: 32,
      totalTokens: 96,
    });
    expect(openAiFactoryMock).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'sk-openai-from-secret' }),
    );
  });

  it('wires the MCP tool endpoint when provided', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ payload: 'mcp-result' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      const runContext = createExecutionContext({
        runId: 'test-run-mcp',
        componentRef: 'ai-agent-component',
        secrets: secretsService,
      });

      generateTextMock.mockImplementation(async (options: any) => {
        const toolResult = await options.tools.call_mcp_tool.execute({
          toolName: 'dns_lookup',
          arguments: { hostname: 'example.com' },
        });

        return {
          text: 'Tool invocation complete.',
          steps: [
            {
              text: 'Calling MCP tool.',
              finishReason: 'tool-calls',
              toolCalls: [
                {
                  toolCallId: 'call-2',
                  toolName: 'call_mcp_tool',
                  args: { toolName: 'dns_lookup', arguments: { hostname: 'example.com' } },
                },
              ],
              toolResults: [
                {
                  toolCallId: 'call-2',
                  toolName: 'call_mcp_tool',
                  args: { toolName: 'dns_lookup', arguments: { hostname: 'example.com' } },
                  result: toolResult,
                },
              ],
            },
          ],
          toolResults: [
            {
              toolCallId: 'call-2',
              toolName: 'call_mcp_tool',
              args: { toolName: 'dns_lookup', arguments: { hostname: 'example.com' } },
              result: toolResult,
            },
          ],
          usage: {},
        };
      });

      const params = aiAgent.inputSchema.parse({
        userInput: 'Check DNS for example.com',
        mcp: { endpoint: 'https://mcp.local/session' },
        chatModel: {
          provider: 'openai',
          modelId: 'gpt-4o-mini',
          apiKeySecretId: OPENAI_SECRET_ID,
        },
      });

      const result = await aiAgent.execute(params, runContext);

      expect(toolMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://mcp.local/session',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        }),
      );
      expect(openAiFactoryMock).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'sk-openai-from-secret' }),
      );

      expect(result.toolInvocations).toHaveLength(1);
      expect(result.toolInvocations[0].result).toEqual({ payload: 'mcp-result' });
      expect(result.reasoningTrace[0].actions[0].toolName).toBe('call_mcp_tool');
      expect(result.responseText).toBe('Tool invocation complete.');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
