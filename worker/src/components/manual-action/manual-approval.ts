import { z } from 'zod';
import {
  componentRegistry,
  ComponentDefinition,
  withPortMeta,
  type PortMeta,
} from '@shipsec/component-sdk';

/**
 * Manual Approval Component
 * 
 * This component creates a human-in-the-loop gate that pauses workflow execution
 * until a human approves or rejects the request.
 * 
 * It supports dynamic description templates using context variables.
 */

const inputSchema = z.object({
  // Dynamic variables will be injected here by resolvePorts via .catchall(z.any())
}).catchall(z.any());

type Input = z.infer<typeof inputSchema>;

type Params = {
  title?: string;
  description?: string;
  variables?: { name: string; type: string }[];
  timeout?: string;
};

/**
 * Simple helper to replace {{var}} placeholders in a string
 */
function interpolate(template: string, vars: Record<string, any>): string {
  if (!template) return '';
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
    return vars[key] !== undefined ? String(vars[key]) : match;
  });
}

const mapTypeToSchema = (
  type: string,
): { schema: z.ZodTypeAny; meta?: PortMeta } => {
  switch (type) {
    case 'string':
      return { schema: z.string() };
    case 'number':
      return { schema: z.number() };
    case 'boolean':
      return { schema: z.boolean() };
    case 'secret':
      return {
        schema: z.unknown(),
        meta: {
          editor: 'secret',
          allowAny: true,
          reason: 'Manual approval inputs can include raw secrets.',
          connectionType: { kind: 'primitive', name: 'secret' } as const,
        },
      };
    case 'list':
      return { schema: z.array(z.string()) };
    default:
      return {
        schema: z.unknown(),
        meta: {
          allowAny: true,
          reason: 'Manual approval inputs can include arbitrary JSON.',
          connectionType: { kind: 'primitive', name: 'json' } as const,
        },
      };
  }
};

const outputSchema = z.object({
  approved: withPortMeta(z.boolean().describe('Whether the request was approved'), {
    label: 'Approved',
    description: 'Active path when request is approved',
    isBranching: true,
    branchColor: 'green',
  }),
  rejected: withPortMeta(z.boolean().describe('Whether the request was rejected'), {
    label: 'Rejected',
    description: 'Active path when request is rejected',
    isBranching: true,
    branchColor: 'red',
  }),
  respondedBy: withPortMeta(z.string().describe('Who responded to the request'), {
    label: 'Responded By',
    description: 'The user who resolved this request',
  }),
  responseNote: withPortMeta(
    z.string().optional().describe('Note provided by the responder'),
    {
      label: 'Response Note',
      description: 'The comment left by the responder',
    },
  ),
  respondedAt: withPortMeta(z.string().describe('When the request was resolved'), {
    label: 'Responded At',
    description: 'Timestamp when the request was resolved.',
  }),
  requestId: withPortMeta(z.string().describe('The ID of the human input request'), {
    label: 'Request ID',
    description: 'Unique identifier for the manual approval request.',
  }),
});

type Output = z.infer<typeof outputSchema>;

const definition: ComponentDefinition<Input, Output, Params> = {
  id: 'core.manual_action.approval',
  label: 'Manual Approval',
  category: 'manual_action',
  runner: { kind: 'inline' },
  inputs: inputSchema,
  outputs: outputSchema,
  docs: 'Pauses workflow execution until a human approves or rejects. Supports Markdown and dynamic context variables in the description.',
  ui: {
    slug: 'manual-approval',
    version: '1.2.0',
    type: 'process',
    category: 'manual_action',
    description: 'Pause and wait for manual approval. Supports dynamic templates for providing context to the reviewer.',
    icon: 'ShieldCheck',
    author: {
      name: 'ShipSecAI',
      type: 'shipsecai',
    },
    isLatest: true,
    deprecated: false,
    parameters: [
      {
        id: 'title',
        label: 'Title',
        type: 'text',
        required: true,
        placeholder: 'Approval Required',
        description: 'Title for the approval request',
      },
      {
        id: 'description',
        label: 'Description',
        type: 'textarea',
        required: false,
        placeholder: 'Please review and approve... You can use {{variable}} here.',
        description: 'Detailed description (Markdown supported)',
        helpText: 'Provide context about what needs to be approved. Supports interpolation.',
      },
      {
          id: 'variables',
          label: 'Context Variables',
          type: 'variable-list',
          default: [],
          description: 'Define variables to use as {{name}} in your description.',
      },
      {
        id: 'timeout',
        label: 'Timeout',
        type: 'text',
        required: false,
        placeholder: '24h',
        description: 'How long to wait for approval (e.g., "1h", "24h", "7d")',
      },
    ],
  },
  resolvePorts(params: any) {
    const inputShape: Record<string, z.ZodTypeAny> = {};
    if (params.variables && Array.isArray(params.variables)) {
        for (const v of params.variables) {
            if (!v || !v.name) continue;
            const { schema, meta } = mapTypeToSchema(v.type || 'json');
            inputShape[v.name] = withPortMeta(schema.optional(), {
              ...(meta ?? {}),
              label: v.name,
            });
        }
    }
    return {
      inputs: z.object(inputShape),
      outputs: outputSchema,
    };
  },
  async execute(params, context) {
    const titleTemplate = params.title || 'Approval Required';
    const descriptionTemplate = params.description || '';
    const timeoutStr = params.timeout;

    // Interpolate values
    const title = interpolate(titleTemplate, params);
    const description = interpolate(descriptionTemplate, params);

    // Calculate timeout
    let timeoutAt: string | null = null;
    if (timeoutStr) {
      const timeout = parseTimeout(timeoutStr);
      if (timeout) {
        timeoutAt = new Date(Date.now() + timeout).toISOString();
      }
    }

    const requestId = `req-${context.runId}-${context.componentRef}`;

    context.logger.info(`[Manual Approval] Created request: ${title}`);

    return {
      pending: true as const,
      requestId,
      inputType: 'approval' as const,
      title,
      description,
      timeoutAt,
      contextData: params,
    } as any;
  },
};

function parseTimeout(timeout: string): number | null {
  const match = timeout.match(/^(\d+)(m|h|d)$/);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: return null;
  }
}

componentRegistry.register(definition);
