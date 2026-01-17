import { z } from 'zod';
import {
  componentRegistry,
  ComponentDefinition,
  withPortMeta,
  type PortMeta,
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

const outputSchema = z.record(z.string(), z.any());

type Output = z.infer<typeof outputSchema>;

type Params = {
  title?: string;
  description?: string;
  variables?: { name: string; type: string }[];
  schema?: {
      id: string;
      label: string;
      type: string;
      required: boolean;
      placeholder?: string;
      description?: string;
      options?: string;
  }[];
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
    case 'textarea':
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
          reason: 'Manual form fields can include secrets.',
          connectionType: { kind: 'primitive', name: 'secret' } as const,
        },
      };
    case 'list':
      return { schema: z.array(z.string()) };
    case 'enum':
      return { schema: z.string() };
    default:
      return {
        schema: z.unknown(),
        meta: {
          allowAny: true,
          reason: 'Manual form fields can return arbitrary JSON values.',
          connectionType: { kind: 'primitive', name: 'json' } as const,
        },
      };
  }
};

const definition: ComponentDefinition<Input, Output, Params> = {
  id: 'core.manual_action.form',
  label: 'Manual Form',
  category: 'manual_action',
  runner: { kind: 'inline' },
  inputs: inputSchema,
  outputs: outputSchema,
  docs: 'Pauses workflow execution until a user fills out a form. Supports Markdown and dynamic context variables.',
  ui: {
    slug: 'manual-form',
    version: '1.3.0',
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
          type: 'variable-list',
          default: [],
          description: 'Define variables to use as {{name}} in your description and form fields.',
      },
      {
        id: 'schema',
        label: 'Form Designer',
        type: 'form-fields',
        required: true,
        default: [],
        description: 'Design the form fields interactively.',
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

    const outputShape: Record<string, z.ZodTypeAny> = {
      approved: withPortMeta(z.boolean(), {
        label: 'Approved',
      }),
      respondedBy: withPortMeta(z.string(), {
        label: 'Responded By',
      }),
    };

    // parse schema to get output ports
    if (Array.isArray(params.schema)) {
        for (const field of params.schema) {
            if (!field.id) continue;
            const { schema, meta } = mapTypeToSchema(field.type || 'string');
            outputShape[field.id] = withPortMeta(schema, {
              ...(meta ?? {}),
              label: field.label || field.id,
            });
        }
    }

    return { inputs: z.object(inputShape), outputs: z.object(outputShape) };
  },
  async execute(params, context) {
    const titleTemplate = params.title || 'Form Input Required';
    const descriptionTemplate = params.description || '';
    const timeoutStr = params.timeout;
    const fields = params.schema || [];

    // Interpolate
    const title = interpolate(titleTemplate, params);
    const description = interpolate(descriptionTemplate, params);

    // Build JSON Schema from fields, with interpolation in labels/placeholders
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const field of fields) {
        if (!field.id) continue;
        
        const fieldLabel = interpolate(field.label || field.id, params);
        const fieldPlaceholder = interpolate(field.placeholder || '', params);
        const fieldDesc = interpolate(field.description || '', params);

        let type = field.type || 'string';
        let jsonProp: any = {
            title: fieldLabel,
            description: fieldPlaceholder || fieldDesc,
        };

        if (type === 'textarea') {
            jsonProp.type = 'string';
            jsonProp.format = 'textarea';
        } else if (type === 'enum') {
            jsonProp.type = 'string';
            const options = (field.options || '').split(',').map((s: string) => s.trim()).filter(Boolean);
            jsonProp.enum = options;
        } else if (type === 'number') {
            jsonProp.type = 'number';
        } else if (type === 'boolean') {
            jsonProp.type = 'boolean';
        } else {
            jsonProp.type = 'string';
        }

        properties[field.id] = jsonProp;
        if (field.required) {
            required.push(field.id);
        }
    }

    const schema = {
        type: 'object',
        properties,
        required,
    };

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
      inputType: 'form' as const,
      title,
      description,
      inputSchema: schema,
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
