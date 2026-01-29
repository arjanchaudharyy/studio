import { z } from 'zod';
import {
  componentRegistry,
  defineComponent,
  inputs,
  outputs,
  parameters,
  param,
  port,
  runComponentWithRunner,
} from '@shipsec/component-sdk';

const inputSchema = inputs({});

const outputSchema = outputs({
  endpoint: port(z.string().describe('The URL of the MCP server'), { label: 'Endpoint' }),
  containerId: port(z.string().optional().describe('The Docker container ID'), {
    label: 'Container ID',
    hidden: true,
  }),
});

const parameterSchema = parameters({
  mode: param(z.enum(['http', 'stdio']).default('http').describe('How to launch the MCP server.'), {
    label: 'Mode',
    editor: 'select',
    options: [
      { label: 'HTTP Server', value: 'http' },
      { label: 'Stdio Server (Proxy)', value: 'stdio' },
    ],
    description: 'HTTP starts a native MCP HTTP server. Stdio starts a proxy container.',
  }),
  image: param(z.string().describe('Docker image for the MCP server'), {
    label: 'Docker Image',
    editor: 'text',
    placeholder: 'shipsec/mcp-stdio-proxy:latest',
  }),
  stdioCommand: param(
    z.string().optional().describe('Stdio MCP command to run inside the proxy container.'),
    {
      label: 'Stdio Command',
      editor: 'text',
      placeholder: 'uvx',
    },
  ),
  stdioArgs: param(
    z.array(z.string()).default([]).describe('Arguments for the stdio MCP command.'),
    {
      label: 'Stdio Args',
      editor: 'variable-list',
    },
  ),
  command: param(z.array(z.string()).default([]).describe('Entrypoint command'), {
    label: 'Command',
    editor: 'variable-list',
  }),
  args: param(z.array(z.string()).default([]).describe('Arguments for the command'), {
    label: 'Arguments',
    editor: 'variable-list',
  }),
  env: param(z.record(z.string(), z.string()).default({}).describe('Environment variables'), {
    label: 'Environment Variables',
    editor: 'json',
  }),
  port: param(z.number().default(8080).describe('Internal port the server listens on'), {
    label: 'Port',
    editor: 'number',
  }),
});

const definition = defineComponent({
  id: 'core.mcp.server',
  label: 'MCP Server',
  category: 'it_ops',
  // The runner configuration here is a placeholder.
  // The actual runner config is constructed dynamically in the execute method
  // because `this.runner` is not interpolated when used directly in `execute`.
  runner: {
    kind: 'docker',
    image: 'placeholder',
    command: [],
    detached: true,
  },
  inputs: inputSchema,
  outputs: outputSchema,
  parameters: parameterSchema,
  docs: 'Starts an MCP server in a Docker container and registers it as a tool source. Use stdio mode with the MCP stdio proxy image to wrap CLI-based MCP servers.',
  ui: {
    slug: 'mcp-server',
    version: '1.0.0',
    type: 'process',
    category: 'it_ops',
    description: 'Run an external Model Context Protocol (MCP) server.',
    icon: 'Server',
    author: {
      name: 'ShipSecAI',
      type: 'shipsecai',
    },
    isLatest: true,
  },
  async execute({ params }, context) {
    let containerId: string | undefined;
    const serverPort = params.port || 8080; // Determine the port once

    if (params.image) {
      const isStdioMode = params.mode === 'stdio';
      // Manually construct runner config to resolve parameters,
      // as `this.runner` is not interpolated when used directly in `execute`.
      const runnerConfig = {
        kind: 'docker' as const, // Explicitly type as 'docker' literal
        image: params.image,
        // Combine command and args into a single array for the Docker command
        command: isStdioMode
          ? []
          : [...(params.command || []), ...(params.args || [])],
        env: {
          ...params.env,
          ...(isStdioMode
            ? {
                MCP_COMMAND: params.stdioCommand ?? '',
                MCP_ARGS: JSON.stringify(params.stdioArgs ?? []),
                MCP_PORT: String(serverPort),
              }
            : {}),
        },
        detached: true,
        // Map the internal server port to the same host port
        ports: { [serverPort]: serverPort },
      };

      // For local docker MCP servers, we start the container using the runner.
      const result = await runComponentWithRunner(
        runnerConfig, // Pass the dynamically constructed runner config
        async () => ({}),
        params,
        context,
      );

      if (result && typeof result === 'object' && 'containerId' in result) {
        containerId = (result as any).containerId;
      }
    }

    const port = params.port || 8080;
    return {
      endpoint: `http://localhost:${port}`,
      containerId,
    };
  },
});

componentRegistry.register(definition);

export type McpServerInput = typeof inputSchema;
export type McpServerParams = typeof parameterSchema;
export type McpServerOutput = typeof outputSchema;
