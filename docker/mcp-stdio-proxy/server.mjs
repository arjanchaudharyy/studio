import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

function parseArgs(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    // fall through
  }
  return raw
    .split(' ')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

const command = process.env.MCP_COMMAND;
const args = parseArgs(process.env.MCP_ARGS || '');
const port = Number.parseInt(process.env.PORT || process.env.MCP_PORT || '8080', 10);

if (!command) {
  console.error('MCP_COMMAND is required to start the stdio MCP server.');
  process.exit(1);
}

const client = new Client({ name: 'shipsec-mcp-stdio-proxy', version: '1.0.0' });
const clientTransport = new StdioClientTransport({
  command,
  args,
});

await client.connect(clientTransport);

const toolsResponse = await client.listTools();
const tools = toolsResponse.tools ?? [];

const server = new McpServer({
  name: 'shipsec-mcp-stdio-proxy',
  version: '1.0.0',
});

for (const tool of tools) {
  server.registerTool(
    tool.name,
    {
      description: tool.description,
      inputSchema: tool.inputSchema,
    },
    async (toolArgs) => {
      return client.callTool({
        name: tool.name,
        arguments: toolArgs ?? {},
      });
    },
  );
}

const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: () => 'stdio-proxy',
  enableJsonResponse: true,
});
await server.connect(transport);

const app = express();
app.use(express.json({ limit: '2mb' }));

app.all('/mcp', async (req, res) => {
  try {
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('Failed to handle MCP request', error);
    if (!res.headersSent) {
      res.status(500).send('MCP proxy error');
    }
  }
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', toolCount: tools.length });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`MCP stdio proxy listening on http://0.0.0.0:${port}/mcp`);
  console.log(`Proxied MCP command: ${command} ${args.join(' ')}`);
});
