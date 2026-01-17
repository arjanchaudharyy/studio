import { z } from 'zod';
import {
  componentRegistry,
  ComponentDefinition,
  ConfigurationError,
  ComponentRetryPolicy,
  withPortMeta,
} from '@shipsec/component-sdk';
import { LLMProviderSchema, type LlmProviderConfig } from '@shipsec/contracts';

const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_BASE_URL = process.env.GEMINI_BASE_URL ?? '';

const inputSchema = z.object({
  model: z
    .string()
    .default(DEFAULT_MODEL)
    .describe('Gemini model identifier (e.g., gemini-2.5-flash).'),
  apiBaseUrl: z
    .string()
    .default(DEFAULT_BASE_URL)
    .describe('Optional override for the Gemini API base URL.'),
  apiKey: withPortMeta(
    z.string()
      .min(1, 'API key is required')
      .describe('Resolved Gemini API key supplied via a Secret Loader node.'),
    {
      label: 'API Key',
      description: 'Connect the Secret Loader output containing the Gemini API key.',
      editor: 'secret',
      connectionType: { kind: 'primitive', name: 'secret' },
    },
  ),
  projectId: z
    .string()
    .optional()
    .describe('Optional Google Cloud project identifier if required by the Gemini endpoint.'),
});

type Input = z.infer<typeof inputSchema>;

const outputSchema = z.object({
  chatModel: withPortMeta(LLMProviderSchema(), {
    label: 'LLM Provider Config',
    description:
      'Portable provider payload (provider, model, overrides) for wiring into AI Agent or one-shot nodes.',
  }),
});

type Output = z.infer<typeof outputSchema>;

// Retry policy for provider configuration - no retries needed for config validation
const geminiProviderRetryPolicy: ComponentRetryPolicy = {
  maxAttempts: 1, // Provider config is deterministic, no retry needed
  nonRetryableErrorTypes: ['ConfigurationError', 'ValidationError'],
};

const definition: ComponentDefinition<Input, Output> = {
  id: 'core.provider.gemini',
  label: 'Gemini Provider',
  category: 'ai',
  runner: { kind: 'inline' },
  retryPolicy: geminiProviderRetryPolicy,
  inputs: inputSchema,
  outputs: outputSchema,
  docs: 'Emits a Gemini provider configuration for downstream AI components.',
  ui: {
    slug: 'gemini-provider',
    version: '1.0.0',
    type: 'process',
    category: 'ai',
    description: 'Normalize Gemini credentials and model selection into a reusable provider config.',
    icon: 'Settings',
    author: {
      name: 'ShipSecAI',
      type: 'shipsecai',
    },
    parameters: [
      {
        id: 'model',
        label: 'Model',
        type: 'select',
        required: true,
        default: DEFAULT_MODEL,
        description: 'Gemini model to emit.',
        options: [
          { label: 'Gemini 3 Pro (Preview)', value: 'gemini-3-pro-preview' },
          { label: 'Gemini 3 Flash (Preview)', value: 'gemini-3-flash-preview' },
          { label: 'Gemini 2.5 Pro', value: 'gemini-2.5-pro' },
          { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash' },
        ],
      },
      {
        id: 'apiBaseUrl',
        label: 'API Base URL',
        type: 'text',
        required: false,
        default: DEFAULT_BASE_URL,
        description: 'Override for the Gemini API base URL (leave blank for the default provider URL).',
      },
      {
        id: 'projectId',
        label: 'Project ID',
        type: 'text',
        required: false,
        description: 'Optional Google Cloud project identifier if your Gemini endpoint requires it.',
      },
    ],
  },
  async execute(params, context) {
    const { model, apiBaseUrl, apiKey, projectId } = params;

    const effectiveApiKey = apiKey.trim();
    if (!effectiveApiKey) {
      throw new ConfigurationError('Gemini API key is required but was not provided.', {
        configKey: 'apiKey',
      });
    }

    const trimmedBaseUrl = apiBaseUrl?.trim() ? apiBaseUrl.trim() : process.env.GEMINI_BASE_URL;
    const trimmedProjectId = projectId?.trim();

    context.logger.info(`[GeminiProvider] Emitting config for model ${model}`);

    return {
      chatModel: {
        provider: 'gemini',
        modelId: model,
        apiKey: effectiveApiKey,
        ...(trimmedBaseUrl ? { baseUrl: trimmedBaseUrl } : {}),
        ...(trimmedProjectId ? { projectId: trimmedProjectId } : {}),
      } satisfies LlmProviderConfig,
    };
  },
};

componentRegistry.register(definition);
