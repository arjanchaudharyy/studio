import { z } from 'zod';
import {
  componentRegistry,
  ComponentDefinition,
  port,
  registerContract,
} from '@shipsec/component-sdk';

/**
 * Manual Form Component
 *
 * Pauses workflow to ask the user to fill out a form.
 * Supports dynamic templates for title and description.
 */

const inputSchema = z.object({
  // Dynamic variables will be injected here by resolvePorts
}).catchall(z.any());

type Input = z.infer<typeof inputSchema>;

const outputSchema = z.object({
  pending: z.literal(true),
  requestId: z.string(),
  inputType: z.literal('form'),
  title: z.string(),
  description: z.string().nullable(),
  schema: z.record(z.string(), z.unknown()),
  timeoutAt: z.string().nullable(),
});

type Output = z.infer<typeof outputSchema>;

type Params = {
  variables?: { name: string; type: string }[];
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

const mapTypeToPort = (type: string, id: string, label: string) => {
  switch (type) {
    case 'string': return { id, label, dataType: port.text(), required: false };
    case 'number': return { id, label, dataType: port.number(), required: false };
    case 'boolean': return { id, label, dataType: port.boolean(), required: false };
    case 'secret': return { id, label, dataType: port.secret(), required: false };
    case 'list': return { id, label, dataType: port.list(port.text()), required: false };
    default: return { id, label, dataType: port.any(), required: false };
  }
};

const HUMAN_FORM_PENDING_CONTRACT = 'core.manual-form.pending.v1';

registerContract({
  name: HUMAN_FORM_PENDING_CONTRACT,
  schema: outputSchema,
  summary: 'Manual form pending response',
  description: 'Indicates that a workflow is waiting for manual form input.',
});

const definition: ComponentDefinition<Input, Output, Params> = {
  id: 'core.manual_action.form',
  label: 'Manual Form',
  category: 'manual_action',
  runner: { kind: 'inline' },
  inputSchema,
  outputSchema,
  docs: 'Pauses workflow execution until a user fills out a form. Supports Markdown and dynamic context variables.',
  metadata: {
    slug: 'manual-form',
    version: '1.2.0',
    type: 'process',
    category: 'manual_action',
    description: 'Collect structured data via a manual form. Supports dynamic context templates.',
    icon: 'FormInput', 
    author: {
      name: 'ShipSecAI',
      type: 'shipsecai',
    },
    isLatest: true,
    deprecated: false,
    inputs: [],
    outputs: [
      {
        id: 'result',
        label: 'Form Request',
        dataType: port.contract(HUMAN_FORM_PENDING_CONTRACT),
        description: 'The pending form request details',
      },
    ],
    parameters: [
      {
        id: 'title',
        label: 'Title',
        type: 'text',
        required: true,
        placeholder: 'Information Required',
        description: 'Title for the form',
      },
      {
        id: 'description',
        label: 'Description',
        type: 'textarea',
        required: false,
        placeholder: 'Please provide details below... You can use {{variable}} here.',
        description: 'Instructions (Markdown supported)',
        helpText: 'Provide context for the form. Supports interpolation.',
      },
      {
          id: 'variables',
          label: 'Context Variables',
          type: 'json',
          default: [],
          description: 'Define variables to use as {{name}} in your description.',
      },
      {
        id: 'schema',
        label: 'Form Schema',
        type: 'json',
        required: true,
        placeholder: '{"type": "object", "properties": {"reason": {"type": "string"}}}',
        description: 'JSON Schema defining the form fields',
      },
      {
        id: 'timeout',
        label: 'Timeout',
        type: 'text',
        required: false,
        placeholder: '24h',
        description: 'Time to wait (e.g. 1h, 24h)',
      },
    ],
  },
  resolvePorts(params) {
    const inputs: any[] = [];
    if (params.variables && Array.isArray(params.variables)) {
        for (const v of params.variables) {
            if (!v || !v.name) continue;
            inputs.push(mapTypeToPort(v.type || 'json', v.name, v.name));
        }
    }
    return { inputs };
  },
  async execute(params, context) {
    const titleTemplate = params.title || 'Form Input Required';
    const descriptionTemplate = params.description || '';
    const timeoutStr = params.timeout;
    const schemaRaw = params.schema;

    // Interpolate
    const title = interpolate(titleTemplate, params);
    const description = interpolate(descriptionTemplate, params);

    // Parse schema
    let schema: Record<string, unknown> = {};
    if (typeof schemaRaw === 'string') {
        try {
            schema = JSON.parse(schemaRaw);
        } catch (e) {
            throw new Error('Invalid JSON Schema string provided.');
        }
    } else if (typeof schemaRaw === 'object' && schemaRaw !== null) {
        schema = schemaRaw as Record<string, unknown>;
    } else {
        throw new Error('Form Schema must be a valid JSON object or string.');
    }

    // Measure timeout
    let timeoutAt: string | null = null;
    if (timeoutStr) {
      const timeout = parseTimeout(timeoutStr);
      if (timeout) {
        timeoutAt = new Date(Date.now() + timeout).toISOString();
      }
    }

    const requestId = `req-${context.runId}-${context.componentRef}`;
    
    context.logger.info(`[Manual Form] Created request: ${title}`);

    return {
      pending: true as const,
      requestId,
      inputType: 'form',
      title,
      description,
      schema,
      timeoutAt,
      contextData: params,
    };
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
