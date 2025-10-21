import { randomUUID } from 'crypto';
import { z } from 'zod';
import { CoreMessage, generateText, tool } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { componentRegistry, ComponentDefinition } from '@shipsec/component-sdk';

type ModelProvider = 'openai' | 'gemini';

const HARDCODED_OPENAI_KEY = 'sk-REPLACE_WITH_REAL_KEY';
const HARDCODED_GEMINI_KEY = 'gm-REPLACE_WITH_REAL_KEY';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? HARDCODED_OPENAI_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? HARDCODED_GEMINI_KEY;
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL ?? '';
const GEMINI_BASE_URL = process.env.GEMINI_BASE_URL ?? '';

const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_MEMORY_SIZE = 8;
const DEFAULT_STEP_LIMIT = 4;

type AgentMessage = CoreMessage;

const agentMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.unknown(),
});

const toolInvocationSchema = z.object({
  id: z.string(),
  toolName: z.string(),
  args: z.unknown(),
  result: z.unknown().nullable(),
  timestamp: z.string(),
});

const conversationStateSchema = z.object({
  sessionId: z.string(),
  messages: z.array(agentMessageSchema).default([]),
  toolInvocations: z.array(toolInvocationSchema).default([]),
});

const reasoningActionSchema = z.object({
  toolCallId: z.string(),
  toolName: z.string(),
  args: z.unknown(),
});

const reasoningObservationSchema = z.object({
  toolCallId: z.string(),
  toolName: z.string(),
  args: z.unknown(),
  result: z.unknown(),
});

const reasoningStepSchema = z.object({
  step: z.number().int(),
  thought: z.string(),
  finishReason: z.string(),
  actions: z.array(reasoningActionSchema),
  observations: z.array(reasoningObservationSchema),
});

const chatModelSchema = z.object({
  provider: z.enum(['openai', 'gemini']).default('openai'),
  modelId: z.string().optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
});

const mcpConfigSchema = z.object({
  endpoint: z.string().default(''),
});

const inputSchema = z.object({
  userInput: z
    .string()
    .min(1, 'Input text cannot be empty')
    .describe('Incoming user text for this agent turn.'),
  conversationState: conversationStateSchema
    .optional()
    .describe('Optional prior conversation state to maintain memory across turns.'),
  chatModel: chatModelSchema
    .default({
      provider: 'openai',
      modelId: DEFAULT_OPENAI_MODEL,
    })
    .describe('Chat model configuration (provider, model ID, API key, base URL).'),
  mcp: mcpConfigSchema
    .default({
      endpoint: '',
    })
    .describe('MCP configuration such as the endpoint that exposes external tools.'),
  systemPrompt: z
    .string()
    .default('')
    .describe('Optional system instructions that anchor the agent behaviour.'),
  temperature: z
    .number()
    .min(0)
    .max(2)
    .default(DEFAULT_TEMPERATURE)
    .describe('Sampling temperature. Higher values are more creative, lower values are focused.'),
  maxTokens: z
    .number()
    .int()
    .min(64)
    .max(8192)
    .default(DEFAULT_MAX_TOKENS)
    .describe('Maximum number of tokens to generate on the final turn.'),
  memorySize: z
    .number()
    .int()
    .min(2)
    .max(50)
    .default(DEFAULT_MEMORY_SIZE)
    .describe('How many recent messages (excluding the system prompt) to retain between turns.'),
  stepLimit: z
    .number()
    .int()
    .min(1)
    .max(12)
    .default(DEFAULT_STEP_LIMIT)
    .describe('Maximum sequential reasoning/tool steps before the agent stops.'),
});

type Input = z.infer<typeof inputSchema>;

type ConversationState = z.infer<typeof conversationStateSchema>;
type ToolInvocationEntry = z.infer<typeof toolInvocationSchema>;

type ReasoningStep = z.infer<typeof reasoningStepSchema>;

type Output = {
  responseText: string;
  conversationState: ConversationState;
  toolInvocations: ToolInvocationEntry[];
  reasoningTrace: ReasoningStep[];
  usage?: unknown;
  rawResponse: unknown;
};

const outputSchema = z.object({
  responseText: z.string(),
  conversationState: conversationStateSchema,
  toolInvocations: z.array(toolInvocationSchema),
  reasoningTrace: z.array(reasoningStepSchema),
  usage: z.unknown().optional(),
  rawResponse: z.unknown(),
});

class MCPClient {
  private readonly endpoint: string;
  private readonly sessionId: string;

  constructor(endpoint: string, sessionId: string) {
    this.endpoint = endpoint.replace(/\/+$/, '');
    this.sessionId = sessionId;
  }

  async execute(toolName: string, args: unknown): Promise<unknown> {
    const payload = {
      sessionId: this.sessionId,
      toolName,
      arguments: args ?? {},
    };

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-MCP-Session': this.sessionId,
        'X-MCP-Tool': toolName,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '<no body>');
      throw new Error(`MCP request failed (${response.status} ${response.statusText}): ${errorText}`);
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      return await response.json();
    }

    return await response.text();
  }
}

function ensureModelName(provider: ModelProvider, modelId?: string | null): string {
  const trimmed = modelId?.trim();
  if (trimmed && trimmed.length > 0) {
    return trimmed;
  }

  return provider === 'gemini' ? DEFAULT_GEMINI_MODEL : DEFAULT_OPENAI_MODEL;
}

function resolveApiKey(provider: ModelProvider, overrideKey?: string | null): string {
  const trimmed = overrideKey?.trim();
  if (trimmed) {
    return trimmed;
  }

  if (provider === 'gemini') {
    return GEMINI_API_KEY;
  }

  return OPENAI_API_KEY;
}

function ensureSystemMessage(history: AgentMessage[], systemPrompt: string): AgentMessage[] {
  if (!systemPrompt.trim()) {
    return history;
  }

  const [firstMessage, ...rest] = history;
  const systemMessage: AgentMessage = { role: 'system', content: systemPrompt.trim() };

  if (!firstMessage) {
    return [systemMessage];
  }

  if (firstMessage.role !== 'system') {
    return [systemMessage, firstMessage, ...rest];
  }

  if (firstMessage.content !== systemPrompt.trim()) {
    return [{ role: 'system', content: systemPrompt.trim() as string }, ...rest];
  }

  return history;
}

function trimConversation(history: AgentMessage[], memorySize: number): AgentMessage[] {
  if (history.length <= memorySize) {
    return history;
  }

  const systemMessages = history.filter((message) => message.role === 'system');
  const nonSystemMessages = history.filter((message) => message.role !== 'system');

  const trimmedNonSystem = nonSystemMessages.slice(-memorySize);

  return [...systemMessages.slice(0, 1), ...trimmedNonSystem];
}

const definition: ComponentDefinition<Input, Output> = {
  id: 'core.ai.agent',
  label: 'AI SDK Agent',
  category: 'process',
  runner: { kind: 'inline' },
  inputSchema,
  outputSchema,
  docs: `An AI SDK-powered agent that maintains conversation memory, calls MCP tools, and returns both the final answer and a reasoning trace.

How it behaves:
- Memory → The agent maintains a conversation state object you can persist between turns.
- Model → Connect a chat model configuration output into the Chat Model input or customise the defaults below.
- MCP → Supply an MCP endpoint through the MCP input to expose your external tools.

Typical workflow:
1. Manual Trigger (or upstream Chat Model) → wire its text output into User Input.
2. AI SDK Agent (this node) → loops with Think/Act/Observe, logging tool calls and keeping state.
3. Downstream node (Console Log, Storage, etc.) → consume responseText or reasoningTrace.

Loop the Conversation State output back into the next agent invocation to keep multi-turn context.`,
  metadata: {
    slug: 'ai-agent',
    version: '1.0.0',
    type: 'process',
    category: 'building-block',
    description: 'AI SDK agent with conversation memory, MCP tool calling, and reasoning trace output.',
    icon: 'Bot',
    author: {
      name: 'ShipSecAI',
      type: 'shipsecai',
    },
    inputs: [
      {
        id: 'userInput',
        label: 'User Input',
        type: 'string',
        required: true,
        description: 'Incoming user text for this agent turn.',
      },
      {
        id: 'chatModel',
        label: 'Chat Model',
        type: 'object',
        required: false,
        description: 'Provider configuration. Example: {"provider":"gemini","modelId":"gemini-2.5-flash","apiKey":"gm-..."}',
      },
      {
        id: 'mcp',
        label: 'MCP',
        type: 'object',
        required: false,
        description: 'MCP connection settings. Example: {"endpoint":"https://mcp.example.com/session"}',
      },
    ],
    outputs: [
      {
        id: 'responseText',
        label: 'Agent Response',
        type: 'string',
        description: 'Final assistant message produced by the agent.',
      },
      {
        id: 'conversationState',
        label: 'Conversation State',
        type: 'object',
        description: 'Updated conversation memory for subsequent agent turns.',
      },
      {
        id: 'toolInvocations',
        label: 'Tool Invocations',
        type: 'object',
        description: 'Array of MCP tool calls executed during this run.',
      },
      {
        id: 'reasoningTrace',
        label: 'Reasoning Trace',
        type: 'object',
        description: 'Sequence of Think → Act → Observe steps executed by the agent.',
      },
    ],
    parameters: [
      {
        id: 'systemPrompt',
        label: 'System Instructions',
        type: 'textarea',
        required: false,
        default: '',
        rows: 4,
        description: 'Optional system directive that guides the agent behaviour.',
      },
      {
        id: 'temperature',
        label: 'Temperature',
        type: 'number',
        required: false,
        default: DEFAULT_TEMPERATURE,
        min: 0,
        max: 2,
        description: 'Higher values increase creativity, lower values improve determinism.',
      },
      {
        id: 'maxTokens',
        label: 'Max Tokens',
        type: 'number',
        required: false,
        default: DEFAULT_MAX_TOKENS,
        min: 64,
        max: 8192,
        description: 'Upper bound for tokens generated in the final response.',
      },
      {
        id: 'memorySize',
        label: 'Memory Size',
        type: 'number',
        required: false,
        default: DEFAULT_MEMORY_SIZE,
        min: 2,
        max: 50,
        description: 'How many recent turns to keep in memory (excluding the system prompt).',
      },
      {
        id: 'stepLimit',
        label: 'Step Limit',
        type: 'number',
        required: false,
        default: DEFAULT_STEP_LIMIT,
        min: 1,
        max: 12,
        description: 'Maximum reasoning/tool steps before the agent stops automatically.',
      },
    ],
  },
  async execute(params, context) {
    const {
      userInput,
      conversationState,
      chatModel,
      mcp,
      systemPrompt,
      temperature,
      maxTokens,
      memorySize,
      stepLimit,
    } = params;

    const trimmedInput = userInput.trim();

    if (!trimmedInput) {
      throw new Error('AI Agent requires a non-empty user input.');
    }

    const effectiveProvider = (chatModel?.provider ?? 'openai') as ModelProvider;
    const effectiveModel = ensureModelName(effectiveProvider, chatModel?.modelId ?? null);
    const effectiveApiKey = resolveApiKey(effectiveProvider, chatModel?.apiKey ?? null);

    if (!effectiveApiKey || effectiveApiKey === HARDCODED_OPENAI_KEY || effectiveApiKey === HARDCODED_GEMINI_KEY) {
      throw new Error(
        'Model provider API key is not configured. Provide chatModel.apiKey or configure OPENAI_API_KEY / GEMINI_API_KEY.',
      );
    }

    const explicitBaseUrl = chatModel?.baseUrl?.trim();
    const baseUrl =
      explicitBaseUrl && explicitBaseUrl.length > 0
        ? explicitBaseUrl
        : effectiveProvider === 'gemini'
          ? GEMINI_BASE_URL
          : OPENAI_BASE_URL;

    const incomingState = conversationState;

    const sessionId = incomingState?.sessionId ?? randomUUID();
    const existingMessages = Array.isArray(incomingState?.messages) ? incomingState!.messages : [];
    const existingToolHistory = Array.isArray(incomingState?.toolInvocations)
      ? incomingState!.toolInvocations
      : [];

    let history: AgentMessage[] = ensureSystemMessage([...existingMessages], systemPrompt ?? '');
    history = trimConversation(history, memorySize);

    const userMessage: AgentMessage = { role: 'user', content: trimmedInput };
    const historyWithUser = trimConversation([...history, userMessage], memorySize);

    const mcpEndpoint = mcp?.endpoint?.trim() ?? '';
    const mcpClient = mcpEndpoint.length > 0 ? new MCPClient(mcpEndpoint, sessionId) : null;

    const callMcpTool =
      mcpClient !== null
        ? tool({
            description:
              'Execute a tool via the configured MCP endpoint. Provide {"toolName": string, "arguments": any}.',
            parameters: z.object({
              toolName: z.string().min(1),
              arguments: z.unknown().optional(),
            }),
            async execute({ toolName, arguments: args }) {
              const result = await mcpClient!.execute(toolName, args ?? {});
              return result;
            },
          })
        : null;

    const toolsConfig = callMcpTool ? { call_mcp_tool: callMcpTool } : undefined;
    const availableToolsCount = callMcpTool ? 1 : 0;

    const systemMessageEntry = historyWithUser.find((message) => message.role === 'system');
    const resolvedSystemPrompt =
      systemPrompt?.trim()?.length
        ? systemPrompt.trim()
        : systemMessageEntry && typeof systemMessageEntry.content === 'string'
          ? systemMessageEntry.content
          : systemMessageEntry && systemMessageEntry.content !== undefined
            ? JSON.stringify(systemMessageEntry.content)
            : '';

    const messagesForModel: CoreMessage[] = historyWithUser
      .filter((message) => message.role !== 'system')
      .map((message) => ({
        role: message.role,
        content:
          typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
      }));

    const model =
      effectiveProvider === 'gemini'
        ? createGoogleGenerativeAI({
            apiKey: effectiveApiKey,
            ...(baseUrl ? { baseURL: baseUrl } : {}),
          })(effectiveModel)
        : createOpenAI({
            apiKey: effectiveApiKey,
            ...(baseUrl ? { baseURL: baseUrl } : {}),
          })(effectiveModel);

    context.logger.info(
      `[ReActAgent] Using ${effectiveProvider} model "${effectiveModel}" with ${availableToolsCount} connected tool(s).`,
    );
    context.emitProgress('AI agent reasoning in progress...');

    const generationResult = await generateText({
      model,
      system: resolvedSystemPrompt || undefined,
      messages: messagesForModel,
      temperature,
      maxTokens,
      maxSteps: stepLimit,
      ...(toolsConfig ? { tools: toolsConfig } : {}),
    });

    const responseText =
      typeof generationResult.text === 'string' ? generationResult.text : String(generationResult.text ?? '');

    const currentTimestamp = new Date().toISOString();

    const reasoningTrace: ReasoningStep[] = Array.isArray(generationResult.steps)
      ? generationResult.steps.map((step: any, index: number) => ({
          step: index + 1,
          thought: typeof step?.text === 'string' ? step.text : JSON.stringify(step?.text ?? ''),
          finishReason: typeof step?.finishReason === 'string' ? step.finishReason : 'other',
          actions: Array.isArray(step?.toolCalls)
            ? step.toolCalls.map((toolCall: any) => ({
                toolCallId: toolCall?.toolCallId ?? `${sessionId}-tool-${index + 1}`,
                toolName: toolCall?.toolName ?? 'tool',
                args: toolCall?.args ?? null,
              }))
            : [],
          observations: Array.isArray(step?.toolResults)
            ? step.toolResults.map((toolResult: any) => ({
                toolCallId: toolResult?.toolCallId ?? `${sessionId}-tool-${index + 1}`,
                toolName: toolResult?.toolName ?? 'tool',
                args: toolResult?.args ?? null,
                result: toolResult?.result ?? null,
              }))
            : [],
        }))
      : [];

    const toolLogEntries: ToolInvocationEntry[] = Array.isArray(generationResult.toolResults)
      ? generationResult.toolResults.map((toolResult: any, index: number) => ({
          id: `${sessionId}-${toolResult?.toolCallId ?? index + 1}`,
          toolName: toolResult?.toolName ?? 'tool',
          args: toolResult?.args ?? null,
          result: toolResult?.result ?? null,
          timestamp: currentTimestamp,
        }))
      : [];

    const toolMessages: AgentMessage[] = Array.isArray(generationResult.toolResults)
      ? generationResult.toolResults.map((toolResult: any) => ({
          role: 'tool',
          content: {
            toolCallId: toolResult?.toolCallId ?? '',
            toolName: toolResult?.toolName ?? 'tool',
            args: toolResult?.args ?? null,
            result: toolResult?.result ?? null,
          },
        }))
      : [];

    const assistantMessage: AgentMessage = {
      role: 'assistant',
      content: responseText,
    };

    let updatedMessages = trimConversation([...historyWithUser, ...toolMessages], memorySize);
    updatedMessages = trimConversation([...updatedMessages, assistantMessage], memorySize);

    const combinedToolHistory = [...existingToolHistory, ...toolLogEntries];

    const nextState: ConversationState = {
      sessionId,
      messages: updatedMessages,
      toolInvocations: combinedToolHistory,
    };

    context.emitProgress('AI agent completed.');

    return {
      responseText,
      conversationState: nextState,
      toolInvocations: toolLogEntries,
      reasoningTrace,
      usage: generationResult.usage,
      rawResponse: generationResult,
    };
  },
};

componentRegistry.register(definition);
