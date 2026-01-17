import { z } from 'zod';
import {
  componentRegistry,
  ComponentDefinition,
  ConfigurationError,
  fromHttpResponse,
  AuthenticationError,
  ComponentRetryPolicy,
  withPortMeta,
} from '@shipsec/component-sdk';

const inputSchema = z.object({
  // Content
  text: withPortMeta(z.string().describe('The plain text message or template.'), {
    label: 'Message Text',
  }),
  blocks: withPortMeta(
    z.union([z.string(), z.array(z.record(z.string(), z.any()))])
      .optional()
      .describe('Slack Block Kit template (JSON string) or object.'),
    {
      label: 'Blocks (JSON)',
      description: 'Optional Slack Block Kit template.',
      connectionType: { kind: 'primitive', name: 'json' },
    },
  ),
  
  // Addressing
  channel: withPortMeta(
    z.string().optional().describe('Channel ID or name.'),
    { label: 'Channel' },
  ),
  thread_ts: withPortMeta(
    z.string().optional().describe('Thread timestamp for replies.'),
    { label: 'Thread TS' },
  ),
  
  // Auth
  authType: z.enum(['bot_token', 'webhook']).default('bot_token'),
  slackToken: withPortMeta(z.string().optional(), {
    label: 'Bot Token',
    editor: 'secret',
    connectionType: { kind: 'primitive', name: 'secret' },
  }),
  webhookUrl: withPortMeta(z.string().optional(), {
    label: 'Webhook URL',
    editor: 'secret',
    connectionType: { kind: 'primitive', name: 'secret' },
  }),

  // Dynamic values will be injected here by resolvePorts
}).catchall(z.any());

type Input = z.infer<typeof inputSchema>;

const outputSchema = z.object({
  ok: withPortMeta(z.boolean(), {
    label: 'OK',
  }),
  ts: withPortMeta(z.string().optional(), {
    label: 'Timestamp',
  }),
  error: withPortMeta(z.string().optional(), {
    label: 'Error',
  }),
});

type Output = z.infer<typeof outputSchema>;

type Params = {
  authType?: 'bot_token' | 'webhook';
  variables?: { name: string; type: string }[];
};

/**
 * Simple helper to replace {{var}} placeholders in a string
 */
function interpolate(template: string, vars: Record<string, any>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
    return vars[key] !== undefined ? String(vars[key]) : match;
  });
}

const mapTypeToSchema = (type: string, label: string) => {
  switch (type) {
    case 'string':
      return withPortMeta(z.string().optional(), { label });
    case 'number':
      return withPortMeta(z.number().optional(), { label });
    case 'boolean':
      return withPortMeta(z.boolean().optional(), { label });
    case 'secret':
      return withPortMeta(z.unknown().optional(), {
        label,
        editor: 'secret',
        allowAny: true,
        reason: 'Slack templates can include secret values.',
        connectionType: { kind: 'primitive', name: 'secret' },
      });
    case 'list':
      return withPortMeta(z.array(z.string()).optional(), { label });
    default:
      return withPortMeta(z.unknown().optional(), {
        label,
        allowAny: true,
        reason: 'Slack templates can include arbitrary JSON values.',
        connectionType: { kind: 'primitive', name: 'json' },
      });
  }
};

// Retry policy optimized for Slack API rate limits
const slackRetryPolicy: ComponentRetryPolicy = {
  maxAttempts: 5,
  initialIntervalSeconds: 2,
  maximumIntervalSeconds: 60,
  backoffCoefficient: 2.0,
  nonRetryableErrorTypes: [
    'AuthenticationError',
    'ConfigurationError',
    'ValidationError',
  ],
};

const definition: ComponentDefinition<Input, Output, Params> = {
  id: 'core.notification.slack',
  label: 'Slack Message',
  category: 'notification',
  runner: { kind: 'inline' },
  retryPolicy: slackRetryPolicy,
  inputs: inputSchema,
  outputs: outputSchema,
  docs: 'Send dynamic Slack messages with {{variable}} support in both text and Block Kit JSON.',
  ui: {
    slug: 'slack-message',
    version: '1.2.0',
    type: 'output',
    category: 'notification',
    description: 'Send plain text or rich Block Kit messages with dynamic template support.',
    icon: 'Slack',
    author: { name: 'ShipSecAI', type: 'shipsecai' },
    isLatest: true,
    deprecated: false,
    parameters: [
      {
        id: 'authType',
        label: 'Connection Method',
        type: 'select',
        default: 'bot_token',
        options: [
          { label: 'Slack App (Bot Token)', value: 'bot_token' },
          { label: 'Incoming Webhook', value: 'webhook' },
        ],
      },
      {
        id: 'variables',
        label: 'Template Variables',
        type: 'variable-list',
        default: [],
        description: 'Define variables to use as {{name}} in your message.',
      }
    ],
  },
  resolvePorts(params) {
    const inputShape: Record<string, z.ZodTypeAny> = {
      text: withPortMeta(z.string(), { label: 'Message Text' }),
      blocks: withPortMeta(z.unknown().optional(), {
        label: 'Blocks (JSON)',
        allowAny: true,
        reason: 'Slack blocks can be raw JSON or string templates.',
        connectionType: { kind: 'primitive', name: 'json' },
      }),
    };

    // Auth specific inputs
    if (params.authType === 'webhook') {
      inputShape.webhookUrl = withPortMeta(z.unknown(), {
        label: 'Webhook URL',
        editor: 'secret',
        allowAny: true,
        reason: 'Webhook URLs are secrets.',
        connectionType: { kind: 'primitive', name: 'secret' },
      });
    } else {
      inputShape.slackToken = withPortMeta(z.unknown(), {
        label: 'Bot Token',
        editor: 'secret',
        allowAny: true,
        reason: 'Slack bot tokens are secrets.',
        connectionType: { kind: 'primitive', name: 'secret' },
      });
      inputShape.channel = withPortMeta(z.string(), { label: 'Channel' });
      inputShape.thread_ts = withPortMeta(z.string().optional(), { label: 'Thread TS' });
    }

    // Dynamic variable inputs
    if (params.variables && Array.isArray(params.variables)) {
      for (const v of params.variables) {
        if (!v || !v.name) continue;
        inputShape[v.name] = mapTypeToSchema(v.type || 'json', v.name);
      }
    }

    return { inputs: z.object(inputShape) };
  },
  async execute(params, context) {
    const { 
        text, 
        blocks, 
        channel, 
        thread_ts, 
        authType, 
        slackToken, 
        webhookUrl,
        ...rest 
    } = params;

    // 1. Interpolate text
    const finalText = interpolate(text, rest);

    // 2. Interpolate and parse blocks if it's a template string
    let finalBlocks = blocks;
    if (typeof blocks === 'string') {
        try {
            const interpolated = interpolate(blocks, rest);
            finalBlocks = JSON.parse(interpolated);
        } catch (e) {
            context.logger.warn('[Slack] Failed to parse blocks JSON after interpolation, sending as raw string');
            finalBlocks = undefined;
        }
    } else if (Array.isArray(blocks)) {
        // If it's already an object, we'd need a deep interpolation, 
        // but typically users will pass a JSON string template for simplicity.
        // For now, let's stringify and interpolate to support variables in objects too!
        const str = JSON.stringify(blocks);
        const interpolated = interpolate(str, rest);
        finalBlocks = JSON.parse(interpolated);
    }

    context.logger.info(`[Slack] Sending message to ${authType}...`);

    const body: any = {
        text: finalText,
        blocks: finalBlocks,
    };

    if (authType === 'webhook') {
      if (!webhookUrl) {
        throw new ConfigurationError('Slack Webhook URL is required.', {
          configKey: 'webhookUrl',
        });
      }
      const response = await context.http.fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const responseBody = await response.text();
        throw fromHttpResponse(response, responseBody);
      }
      return { ok: true };
    } else {
      if (!slackToken) {
        throw new ConfigurationError('Slack token missing.', {
          configKey: 'slackToken',
        });
      }
      body.channel = channel;
      body.thread_ts = thread_ts;

      const response = await context.http.fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${slackToken}`,
        },
        body: JSON.stringify(body),
      });

      const result = await response.json() as any;
      if (!result.ok) {
        // Slack API returns ok: false with an error code
        // Check for common auth errors
        if (result.error === 'invalid_auth' || result.error === 'token_revoked') {
          throw new AuthenticationError(`Slack authentication failed: ${result.error}`);
        }
        return { ok: false, error: result.error };
      }
      return { ok: true, ts: result.ts };
    }
  },
};

componentRegistry.register(definition);

export { definition };
