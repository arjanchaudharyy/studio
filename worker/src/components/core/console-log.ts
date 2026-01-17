import { z } from 'zod';
import {
  componentRegistry,
  ComponentDefinition,
  withPortMeta,
} from '@shipsec/component-sdk';
import { consoleLogResultSchema } from '@shipsec/contracts';

const inputSchema = z.object({
  data: withPortMeta(z.any().describe('Data to log to console'), {
    label: 'Data',
    description: 'Any data to log (objects will be JSON stringified).',
    allowAny: true,
    reason: 'Console log accepts arbitrary payloads for debugging.',
  }),
  label: z.string().optional().describe('Optional label for the log entry'),
});

type Input = z.infer<typeof inputSchema>;

type Output = {
  logged: boolean;
  preview: string;
};

const outputSchema = z.object({
  result: withPortMeta(
    consoleLogResultSchema(),
    {
      label: 'Result',
      description: 'Confirmation that data was logged.',
    },
  ),
  logged: withPortMeta(z.boolean(), {
    label: 'Logged',
    description: 'Indicates whether the log entry was emitted.',
  }),
  preview: withPortMeta(z.string(), {
    label: 'Preview',
    description: 'Short preview of the logged content.',
  }),
});

const definition: ComponentDefinition<Input, Output> = {
  id: 'core.console.log',
  label: 'Console Log',
  category: 'output',
  runner: { kind: 'inline' },
  inputs: inputSchema,
  outputs: outputSchema,
  docs: 'Logs data to workflow execution logs. Useful for debugging and displaying results.',
  ui: {
    slug: 'console-log',
    version: '1.0.0',
    type: 'output',
    category: 'output',
    description: 'Output data to workflow execution logs for debugging and monitoring.',
    icon: 'Terminal',
    author: {
      name: 'ShipSecAI',
      type: 'shipsecai',
    },
    isLatest: true,
    deprecated: false,
    examples: [
      'Preview component output before wiring into external systems.',
      'Dump intermediate data structures while developing new workflows.',
    ],
    parameters: [
      {
        id: 'label',
        label: 'Label',
        type: 'text',
        required: false,
        placeholder: 'My Log',
        description: 'Optional label to identify this log entry.',
        helpText: 'Helps identify logs when multiple console log components are used.',
      },
    ],
  },
  async execute(params, context) {
    const label = params.label || 'Console Log';
    
    context.logger.info(`[${label}] ========================================`);

    // Format the data for logging
    let formattedData: string;
    let preview: string;

    if (typeof params.data === 'object' && params.data !== null) {
      formattedData = JSON.stringify(params.data, null, 2);
      
      // Create a preview (first 200 chars)
      if (Array.isArray(params.data)) {
        preview = `Array with ${params.data.length} items`;
      } else {
        const keys = Object.keys(params.data);
        preview = `Object with ${keys.length} keys: ${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '...' : ''}`;
      }
    } else {
      formattedData = String(params.data);
      preview = formattedData.length > 100 ? formattedData.substring(0, 100) + '...' : formattedData;
    }

    // Log to workflow execution logs
    context.logger.info(`[${label}] ${formattedData}`);
    context.logger.info(`[${label}] ========================================`);

    // Emit progress with preview
    context.emitProgress(`Logged: ${preview}`);

    return {
      result: {
        logged: true,
        preview,
      },
      logged: true,
      preview,
    };
  },
};

componentRegistry.register(definition);
