import { z } from 'zod';
import {
  componentRegistry,
  ComponentDefinition,
  port,
  registerContract,
} from '@shipsec/component-sdk';

/**
 * Manual Selection Component
 *
 * Pauses workflow to ask the user to select from a list of options.
 * Supports dynamic templates for title and description.
 */

const inputSchema = z.object({
  // Dynamic variables will be injected here by resolvePorts
}).catchall(z.any());

type Input = z.infer<typeof inputSchema>;

const outputSchema = z.object({
  pending: z.literal(true),
  requestId: z.string(),
  inputType: z.literal('selection'),
  title: z.string(),
  description: z.string().nullable(),
  options: z.array(z.union([z.string(), z.object({ label: z.string(), value: z.string() })])),
  multiple: z.boolean(),
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

const HUMAN_INPUT_PENDING_CONTRACT = 'core.manual-selection.pending.v1';

registerContract({
  name: HUMAN_INPUT_PENDING_CONTRACT,
  schema: outputSchema,
  summary: 'Manual selection pending response',
  description: 'Indicates that a workflow is waiting for manual selection input.',
});

const definition: ComponentDefinition<Input, Output, Params> = {
  id: 'core.manual_action.selection',
  label: 'Manual Selection',
  category: 'manual_action',
  runner: { kind: 'inline' },
  inputSchema,
  outputSchema,
  docs: 'Pauses workflow execution until a user selects an option. Supports Markdown and dynamic context variables.',
  metadata: {
    slug: 'manual-selection',
    version: '1.2.0',
    type: 'process',
    category: 'manual_action',
    description: 'Ask the user to select from a list of options. Supports dynamic context templates.',
    icon: 'ListChecks',
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
        label: 'Input Request',
        dataType: port.contract(HUMAN_INPUT_PENDING_CONTRACT),
        description: 'The pending request details',
      },
    ],
    parameters: [
      {
        id: 'title',
        label: 'Title',
        type: 'text',
        required: true,
        placeholder: 'Select an option',
        description: 'Title for the request',
      },
      {
        id: 'description',
        label: 'Description',
        type: 'textarea',
        required: false,
        placeholder: 'Please choose one... You can use {{variable}} here.',
        description: 'Instructions (Markdown supported)',
        helpText: 'Provide context for the selection. Supports interpolation.',
      },
      {
          id: 'variables',
          label: 'Context Variables',
          type: 'json',
          default: [],
          description: 'Define variables to use as {{name}} in your description.',
      },
      {
        id: 'options',
        label: 'Options',
        type: 'json',
        required: true,
        placeholder: '["Option A", "Option B"]',
        description: 'List of options (strings or {label, value} objects)',
      },
      {
        id: 'multiple',
        label: 'Allow Multiple',
        type: 'boolean',
        required: false,
        description: 'Allow selecting multiple options',
        default: false,
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
    const titleTemplate = params.title || 'Input Required';
    const descriptionTemplate = params.description || '';
    const timeoutStr = params.timeout;
    const optionsRaw = params.options;
    const multiple = params.multiple === true;

    // Interpolate
    const title = interpolate(titleTemplate, params);
    const description = interpolate(descriptionTemplate, params);

    // Parse options
    let options: Array<string | { label: string; value: string }> = [];
    if (Array.isArray(optionsRaw)) {
        options = optionsRaw;
    } else if (typeof optionsRaw === 'string') {
        try {
            options = JSON.parse(optionsRaw);
        } catch (e) {
            options = optionsRaw.split(',').map(s => s.trim());
        }
    }

    if (!Array.isArray(options) || options.length === 0) {
        throw new Error('Manual Selection component requires at least one option.');
    }

    // Calculate timeout
    let timeoutAt: string | null = null;
    if (timeoutStr) {
      const timeout = parseTimeout(timeoutStr);
      if (timeout) {
        timeoutAt = new Date(Date.now() + timeout).toISOString();
      }
    }

    const requestId = `req-${context.runId}-${context.componentRef}`;
    
    context.logger.info(`[Manual Selection] Created request: ${title}`);

    return {
      pending: true as const,
      requestId,
      inputType: 'selection',
      title,
      description,
      options,
      multiple,
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
