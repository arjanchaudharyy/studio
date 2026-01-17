import { z } from 'zod';
import { componentRegistry, ComponentDefinition, withPortMeta } from '@shipsec/component-sdk';
import { McpToolDefinitionSchema } from '@shipsec/contracts';

const inputSchema = z
  .object({
    slots: z
      .array(
        z.object({
          id: z.string().min(1),
          label: z.string().min(1),
        }),
      )
      .default([
        { id: 'toolsA', label: 'Tools A' },
        { id: 'toolsB', label: 'Tools B' },
      ])
      .describe('Configure which upstream tool lists should be merged.'),
  })
  .passthrough();

type Input = z.infer<typeof inputSchema>;

const outputSchema = z.object({
  tools: withPortMeta(z.array(McpToolDefinitionSchema()), {
    label: 'Merged Tools',
    description: 'Combined MCP tool list with duplicates removed by id.',
  }),
});

type Output = z.infer<typeof outputSchema>;

const definition: ComponentDefinition<Input, Output> = {
  id: 'core.mcp.tools.merge',
  label: 'MCP Tool Merge',
  category: 'ai',
  runner: { kind: 'inline' },
  inputs: inputSchema,
  outputs: outputSchema,
  docs: 'Merge multiple MCP tool lists into a single list for the AI agent.',
  ui: {
    slug: 'mcp-tools-merge',
    version: '0.1.0',
    type: 'process',
    category: 'ai',
    description: 'Combine multiple MCP tool providers into a single list.',
    icon: 'Merge',
    author: {
      name: 'ShipSecAI',
      type: 'shipsecai',
    },
    parameters: [
      {
        id: 'slots',
        label: 'Inputs',
        type: 'json',
        required: false,
        default: [
          { id: 'toolsA', label: 'Tools A' },
          { id: 'toolsB', label: 'Tools B' },
        ],
        description: 'Array of input definitions. Example: [{"id":"toolsA","label":"Tools A"}].',
      },
    ],
  },
  resolvePorts(params) {
    const slots = normalizeSlots((params as Input).slots);
    const inputShape: Record<string, z.ZodTypeAny> = {};
    for (const slot of slots) {
      inputShape[slot.id] = withPortMeta(z.array(McpToolDefinitionSchema()), {
        label: slot.label,
      });
    }

    return {
      inputs: z.object(inputShape),
      outputs: z.object({
        tools: withPortMeta(z.array(McpToolDefinitionSchema()), {
          label: 'Merged Tools',
        }),
      }),
    };
  },
  async execute(params, context) {
    const slots = normalizeSlots(params.slots);
    const merged: Record<string, z.infer<ReturnType<typeof McpToolDefinitionSchema>>> = {};

    for (const slot of slots) {
      const value = (params as Record<string, unknown>)[slot.id];
      if (Array.isArray(value)) {
        for (const entry of value) {
          const parsed = McpToolDefinitionSchema().safeParse(entry);
          if (parsed.success) {
            merged[parsed.data.id] = parsed.data;
          }
        }
      }
    }

    const tools = Object.values(merged);
    context.logger.info(`[McpToolMerge] Merged ${tools.length} MCP tool${tools.length === 1 ? '' : 's'}.`);

    return { tools };
  },
};

function normalizeSlots(slotsInput: Input['slots']): Array<{ id: string; label: string }> {
  const fallback = [
    { id: 'toolsA', label: 'Tools A' },
    { id: 'toolsB', label: 'Tools B' },
  ];
  if (!Array.isArray(slotsInput) || slotsInput.length === 0) {
    return fallback;
  }
  const slots = slotsInput
    .map((slot) => {
      const id = typeof slot?.id === 'string' ? slot.id.trim() : '';
      if (!id) {
        return null;
      }
      return {
        id,
        label: typeof slot?.label === 'string' && slot.label.trim().length > 0 ? slot.label : id,
      };
    })
    .filter((slot): slot is { id: string; label: string } => slot !== null);

  return slots.length > 0 ? slots : fallback;
}

componentRegistry.register(definition);
