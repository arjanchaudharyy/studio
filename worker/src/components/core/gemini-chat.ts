import { z } from 'zod';
import { GoogleGenAI } from '@google/genai';
import { componentRegistry, ComponentDefinition } from '@shipsec/component-sdk';

const HARDCODED_API_KEY = 'gm-REPLACE_WITH_REAL_KEY';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? HARDCODED_API_KEY;
const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_BASE_URL = process.env.GEMINI_BASE_URL ?? '';

const inputSchema = z.object({
  systemPrompt: z
    .string()
    .default('')
    .describe('Optional system instructions sent to the Gemini model.'),
  userPrompt: z
    .string()
    .min(1, 'User prompt cannot be empty')
    .describe('Primary user prompt sent to Gemini.'),
  model: z
    .string()
    .default(DEFAULT_MODEL)
    .describe('Gemini chat model identifier.'),
  temperature: z
    .number()
    .min(0)
    .max(2)
    .default(DEFAULT_TEMPERATURE)
    .describe('Sampling temperature for the response (0-2).'),
  maxTokens: z
    .number()
    .int()
    .min(1)
    .max(8192)
    .default(DEFAULT_MAX_TOKENS)
    .describe('Maximum number of tokens to generate from Gemini.'),
  apiBaseUrl: z
    .string()
    .default(DEFAULT_BASE_URL)
    .describe('Optional override for the Gemini API base URL.'),
  apiKey: z
    .string()
    .optional()
    .describe('Explicit API key override for the Gemini provider. Leave blank to use environment configuration.'),
});

type Input = z.infer<typeof inputSchema>;

type GeminiChatModelConfig = {
  provider: 'gemini';
  modelId: string;
  apiKey?: string;
  baseUrl?: string;
};

type Output = {
  responseText: string;
  finishReason: string | null;
  rawResponse: unknown;
  usage?: unknown;
  chatModel: GeminiChatModelConfig;
};

const chatModelOutputSchema = z.object({
  provider: z.literal('gemini'),
  modelId: z.string(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
});

const outputSchema = z.object({
  responseText: z.string(),
  finishReason: z.string().nullable(),
  rawResponse: z.unknown(),
  usage: z.unknown().optional(),
  chatModel: chatModelOutputSchema,
});

const definition: ComponentDefinition<Input, Output> = {
  id: 'core.gemini.chat',
  label: 'Gemini Chat Completion',
  category: 'transform',
  runner: { kind: 'inline' },
  inputSchema,
  outputSchema,
  docs: 'Executes a one-shot chat completion using the Vercel AI SDK against a Gemini endpoint.',
  metadata: {
    slug: 'gemini-chat-completion',
    version: '1.0.0',
    type: 'process',
    category: 'building-block',
    description: 'Send a system + user prompt to a Gemini chat completion API and return the response.',
    icon: 'MessageCircle',
    author: {
      name: 'ShipSecAI',
      type: 'shipsecai',
    },
    inputs: [
      {
        id: 'systemPrompt',
        label: 'System Prompt',
        type: 'string',
        required: false,
        description: 'Optional system instructions that prime the Gemini model.',
      },
      {
        id: 'userPrompt',
        label: 'User Prompt',
        type: 'string',
        required: true,
        description: 'User input that will be sent to Gemini.',
      },
    ],
    outputs: [
      {
        id: 'responseText',
        label: 'Response Text',
        type: 'string',
        description: 'The assistant response from Gemini.',
      },
      {
        id: 'rawResponse',
        label: 'Raw Response',
        type: 'object',
        description: 'Raw response metadata returned by the Gemini provider for debugging.',
      },
      {
        id: 'usage',
        label: 'Token Usage',
        type: 'object',
        description: 'Token usage metadata returned by the provider, if available.',
      },
      {
        id: 'chatModel',
        label: 'Chat Model Config',
        type: 'object',
        description: 'Configuration object (provider, model, overrides) for wiring into the LangChain Agent node.',
      },
    ],
    parameters: [
      {
        id: 'model',
        label: 'Model',
        type: 'select',
        required: true,
        default: DEFAULT_MODEL,
        description: 'Gemini chat model to invoke.',
        options: [
          { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash' },
          { label: 'Gemini 1.5 Flash', value: 'gemini-1.5-flash-latest' },
          { label: 'Gemini 1.5 Pro', value: 'gemini-1.5-pro-latest' },
          { label: 'Gemini 1.5 Flash 8B', value: 'gemini-1.5-flash-8b-latest' },
        ],
      },
      {
        id: 'apiKey',
        label: 'API Key Override',
        type: 'text',
        required: false,
        default: '',
        placeholder: 'gm-...',
        description: 'Optional API key to use for this invocation.',
        helpText: 'Leave blank to use the worker-level GEMINI_API_KEY environment variable.',
      },
      {
        id: 'temperature',
        label: 'Temperature',
        type: 'number',
        required: false,
        default: DEFAULT_TEMPERATURE,
        min: 0,
        max: 2,
        description: 'Higher values increase creativity, lower values make output deterministic.',
      },
      {
        id: 'maxTokens',
        label: 'Max Tokens',
        type: 'number',
        required: false,
        default: DEFAULT_MAX_TOKENS,
        min: 1,
        max: 8192,
        description: 'Maximum number of tokens to request from the model.',
      },
      {
        id: 'apiBaseUrl',
        label: 'API Base URL',
        type: 'text',
        required: false,
        default: DEFAULT_BASE_URL,
        description: 'Override for the Gemini API base URL (leave blank for the default provider URL).',
      },
    ],
  },
  async execute(params, context) {
    const { systemPrompt, userPrompt, model, temperature, maxTokens, apiBaseUrl, apiKey } = params;

    const overrideApiKey = apiKey?.trim() ?? '';
    const effectiveApiKey = overrideApiKey.length > 0 ? overrideApiKey : GEMINI_API_KEY;

    if (!effectiveApiKey || effectiveApiKey === HARDCODED_API_KEY) {
      throw new Error(
        'Gemini API key is not configured. Supply one via the API Key Override parameter or set GEMINI_API_KEY.',
      );
    }

    const baseUrl = apiBaseUrl?.trim() ? apiBaseUrl.trim() : process.env.GEMINI_BASE_URL;
    const client = new GoogleGenAI({
      apiKey: effectiveApiKey,
      ...(baseUrl ? { baseUrl } : {}),
    });

    context.logger.info(`[GeminiChat] Calling model ${model}`);
    context.emitProgress('Contacting Gemini chat completion endpoint...');

    const trimmedSystemPrompt = systemPrompt?.trim();

    try {
      const prompt = trimmedSystemPrompt
        ? `System Instructions:\n${trimmedSystemPrompt}\n\nUser Prompt:\n${userPrompt}`
        : userPrompt;

      const response = await client.models.generateContent({
        model,
        contents: prompt,
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
        },
      });
      const responseText = response.text ?? '';
      const finishReason =
        response.candidates && response.candidates.length > 0
          ? response.candidates[0]?.finishReason ?? null
          : null;

      context.emitProgress('Received response from Gemini provider');

      const chatModelConfig: GeminiChatModelConfig = {
        provider: 'gemini',
        modelId: model,
        ...(overrideApiKey.length > 0 ? { apiKey: overrideApiKey } : {}),
        ...(baseUrl ? { baseUrl } : {}),
      };

      return {
        responseText,
        finishReason,
        rawResponse: response,
        usage: response.usageMetadata,
        chatModel: chatModelConfig,
      };
    } catch (error) {
      context.logger.error('[GeminiChat] Request failed', error);
      throw error;
    }
  },
};

componentRegistry.register(definition);
