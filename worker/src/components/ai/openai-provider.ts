import { z } from 'zod';
import {
  componentRegistry,
  ComponentDefinition,
  ConfigurationError,
  ComponentRetryPolicy,
  withPortMeta,
} from '@shipsec/component-sdk';
import { LLMProviderSchema, type LlmProviderConfig } from '@shipsec/contracts';

const DEFAULT_MODEL = 'gpt-5.2';
const DEFAULT_BASE_URL = process.env.OPENAI_BASE_URL ?? '';

const inputSchema = z.object({
  model: z
    .string()
    .default(DEFAULT_MODEL)
    .describe('OpenAI compatible chat model identifier.'),
  apiBaseUrl: z
    .string()
    .default(DEFAULT_BASE_URL)
    .describe('Optional override for the OpenAI-compatible API base URL.'),
  apiKey: withPortMeta(
    z.string()
      .min(1, 'API key is required')
      .describe('Resolved OpenAI-compatible API key supplied via a Secret Loader node.'),
    {
      label: 'API Key',
      description: 'Connect the Secret Loader output containing the OpenAI-compatible API key.',
      editor: 'secret',
      connectionType: { kind: 'primitive', name: 'secret' },
    },
  ),
  headers: z
    .record(z.string(), z.string())
    .optional()
    .describe('Optional HTTP headers included when invoking the model.'),
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
const openaiProviderRetryPolicy: ComponentRetryPolicy = {
  maxAttempts: 1, // Provider config is deterministic, no retry needed
  nonRetryableErrorTypes: ['ConfigurationError', 'ValidationError'],
};

const definition: ComponentDefinition<Input, Output> = {
  id: 'core.provider.openai',
  label: 'OpenAI Provider',
  category: 'ai',
  runner: { kind: 'inline' },
  retryPolicy: openaiProviderRetryPolicy,
  inputs: inputSchema,
  outputs: outputSchema,
  docs: 'Emits a reusable OpenAI provider configuration that downstream AI components can consume.',
  ui: {
    slug: 'openai-provider',
    version: '1.1.0',
    type: 'process',
    category: 'ai',
    description: 'Normalize OpenAI credentials, base URL, and model selection into a portable provider config.',
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
        description: 'OpenAI compatible chat model to emit.',
        options: [
          { label: 'GPT-5.2', value: 'gpt-5.2' },
          { label: 'GPT-5.2 Pro', value: 'gpt-5.2-pro' },
          { label: 'GPT-5.1', value: 'gpt-5.1' },
          { label: 'GPT-5', value: 'gpt-5' },
          { label: 'GPT-5 Mini', value: 'gpt-5-mini' },
        ],
      },
      {
        id: 'apiBaseUrl',
        label: 'API Base URL',
        type: 'text',
        required: false,
        default: DEFAULT_BASE_URL,
        description:
          'Override for the OpenAI-compatible API base URL (leave blank for the default provider URL).',
      },
      {
        id: 'headers',
        label: 'Headers',
        type: 'json',
        required: false,
        description: 'Optional HTTP headers included when invoking the model.',
      },
    ],
  },
  async execute(params, context) {
    const { model, apiBaseUrl, apiKey, headers } = params;

    const effectiveApiKey = apiKey.trim();
    if (!effectiveApiKey) {
      throw new ConfigurationError('OpenAI API key is required but was not provided.', {
        configKey: 'apiKey',
      });
    }

    const trimmedBaseUrl = apiBaseUrl?.trim() ? apiBaseUrl.trim() : process.env.OPENAI_BASE_URL;

    const sanitizedHeaders =
      headers && Object.keys(headers).length > 0
        ? Object.entries(headers).reduce<Record<string, string>>((acc, [key, value]) => {
            const trimmedKey = key.trim();
            const trimmedValue = value.trim();
            if (trimmedKey.length > 0 && trimmedValue.length > 0) {
              acc[trimmedKey] = trimmedValue;
            }
            return acc;
          }, {})
        : undefined;

    context.logger.info(`[OpenAIProvider] Emitting config for model ${model}`);

    return {
      chatModel: {
        provider: 'openai',
        modelId: model,
        apiKey: effectiveApiKey,
        ...(trimmedBaseUrl ? { baseUrl: trimmedBaseUrl } : {}),
        ...(sanitizedHeaders ? { headers: sanitizedHeaders } : {}),
      } satisfies LlmProviderConfig,
    };
  },
};

componentRegistry.register(definition);
