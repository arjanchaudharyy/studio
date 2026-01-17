import { z } from 'zod';
import { componentRegistry, ComponentDefinition, withPortMeta } from '@shipsec/component-sdk';

const inputSchema = z.object({
  a: withPortMeta(z.string().optional().describe('First value to include'), {
    label: 'Item A',
    description: 'First string input.',
  }),
  b: withPortMeta(z.string().optional().describe('Second value to include'), {
    label: 'Item B',
    description: 'Second string input.',
  }),
  c: withPortMeta(z.string().optional().describe('Third value to include'), {
    label: 'Item C',
    description: 'Third string input.',
  }),
  d: withPortMeta(z.string().optional().describe('Fourth value to include'), {
    label: 'Item D',
    description: 'Fourth string input.',
  }),
  e: withPortMeta(z.string().optional().describe('Fifth value to include'), {
    label: 'Item E',
    description: 'Fifth string input.',
  }),
});

type Input = z.infer<typeof inputSchema>;

const outputSchema = z.object({
  items: withPortMeta(z.array(z.string()), {
    label: 'Items',
    description: 'Array of defined string inputs in order.',
  }),
  count: withPortMeta(z.number().int(), {
    label: 'Count',
    description: 'Total number of strings packed.',
  }),
});

type Output = z.infer<typeof outputSchema>;

const definition: ComponentDefinition<Input, Output> = {
  id: 'core.array.pack',
  label: 'Array Pack',
  category: 'transform',
  runner: { kind: 'inline' },
  inputs: inputSchema,
  outputs: outputSchema,
  docs: 'Collect up to five string inputs into an ordered array for downstream components such as Text Joiner.',
  ui: {
    slug: 'array-pack',
    version: '1.0.0',
    type: 'process',
    category: 'transform',
    description: 'Combine multiple string inputs into an array.',
    icon: 'ListCollapse',
    author: {
      name: 'ShipSecAI',
      type: 'shipsecai',
    },
    isLatest: true,
  },
  async execute(params, context) {
    const entries: string[] = [];
    (['a', 'b', 'c', 'd', 'e'] as const).forEach((key) => {
      const value = params[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        entries.push(value);
      }
    });

    context.logger.info(`[ArrayPack] Packed ${entries.length} item(s).`);

    return {
      items: entries,
      count: entries.length,
    };
  },
};

componentRegistry.register(definition);
