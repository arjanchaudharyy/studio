import { z } from 'zod';
import {
  componentRegistry,
  ComponentDefinition,
  withPortMeta,
} from '@shipsec/component-sdk';
import {
  McpToolArgumentSchema,
  McpToolDefinitionSchema,
} from '@shipsec/contracts';

const toolEntrySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  toolName: z.string().optional(),
  arguments: z.array(McpToolArgumentSchema).optional(),
});

const inputSchema = z.object({
  endpoint: withPortMeta(
    z.string()
      .min(1, 'MCP endpoint is required')
      .describe('HTTP endpoint that implements the MCP tool invocation contract.'),
    {
      label: 'MCP Endpoint',
      description: 'HTTP URL for the MCP tool server (POST requests are sent here).',
    },
  ),
  headersJson: withPortMeta(
    z.string()
      .optional()
      .describe('Optional JSON object of HTTP headers (e.g., auth tokens).'),
    {
      label: 'Headers (JSON)',
      description: 'Optional headers JSON (e.g., {"Authorization":"Bearer ..."}).',
    },
  ),
  tools: withPortMeta(
    z.array(toolEntrySchema)
      .default([])
      .describe('List of tool entries exposed by this MCP endpoint.'),
    {
      label: 'Tools',
      description: 'Structured tool list (id,title,description,toolName).',
      connectionType: { kind: 'primitive', name: 'json' },
    },
  ),
});

type Input = z.infer<typeof inputSchema>;

const outputSchema = z.object({
  tools: withPortMeta(z.array(McpToolDefinitionSchema()), {
    label: 'MCP Tools',
    description: 'List of MCP tool definitions emitted by this provider.',
  }),
});

type Output = z.infer<typeof outputSchema>;

const definition: ComponentDefinition<Input, Output> = {
  id: 'core.mcp.tools.http',
  label: 'MCP HTTP Tools',
  category: 'ai',
  runner: { kind: 'inline' },
  inputs: inputSchema,
  outputs: outputSchema,
  docs: 'Expose a list of MCP tools backed by an HTTP endpoint (custom or third-party).',
  ui: {
    slug: 'mcp-tools-http',
    version: '0.1.0',
    type: 'process',
    category: 'ai',
    description: 'Package multiple tools served by an HTTP MCP endpoint for consumption by the AI agent.',
    icon: 'Globe',
    author: {
      name: 'ShipSecAI',
      type: 'shipsecai',
    },
    parameters: [
      {
        id: 'endpoint',
        label: 'Endpoint',
        type: 'text',
        required: true,
        description: 'HTTP endpoint that accepts MCP tool invocations.',
      },
      {
        id: 'headersJson',
        label: 'Headers (JSON)',
        type: 'textarea',
        required: false,
        description: 'Optional JSON object of headers (one per line).',
      },
      {
        id: 'tools',
        label: 'Tools',
        type: 'json',
        required: false,
        default: [],
        description:
          'Array of tool entries, e.g., [{"id":"lookup_fact","title":"Lookup Fact","arguments":[{"name":"topic","type":"string"}]}].',
      },
    ],
  },
  async execute(params, context) {
    const headers = parseHeaders(params.headersJson);
    const tools = (params.tools ?? []).map((tool) => ({
      id: tool.id,
      title: tool.title,
      description: tool.description,
      endpoint: params.endpoint,
      headers,
      arguments: tool.arguments,
      metadata: {
        toolName: tool.toolName ?? tool.id,
        source: context.componentRef,
      },
    }));

    context.logger.info(
      `[McpHttpTools] Prepared ${tools.length} MCP tool${tools.length === 1 ? '' : 's'} from ${params.endpoint}.`,
    );

    return { tools };
  },
};

function parseHeaders(headersJson?: string | null): Record<string, string> | undefined {
  if (!headersJson || headersJson.trim().length === 0) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(headersJson);
    if (parsed && typeof parsed === 'object') {
      return Object.entries(parsed).reduce<Record<string, string>>((acc, [key, value]) => {
        if (typeof value === 'string') {
          acc[key] = value;
        }
        return acc;
      }, {});
    }
  } catch (error) {
    console.warn('[McpHttpTools] Failed to parse headers JSON:', error);
  }
  return undefined;
}

componentRegistry.register(definition);
