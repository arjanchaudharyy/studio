import { Controller, Get, Post, UseGuards, Req, Res, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import type { Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { McpAuthGuard, type McpGatewayRequest } from './mcp-auth.guard';
import { McpGatewayService } from './mcp-gateway.service';

@ApiTags('mcp')
@Controller('mcp')
export class McpGatewayController {
  private readonly logger = new Logger(McpGatewayController.name);

  // Mapping of runId to its current Streamable HTTP transport
  private readonly transports = new Map<string, StreamableHTTPServerTransport>();

  constructor(private readonly mcpGateway: McpGatewayService) {}

  @Get('sse')
  @ApiOperation({ summary: 'Establish an MCP SSE connection' })
  @UseGuards(McpAuthGuard)
  async establishSse(@Req() req: McpGatewayRequest, @Res() res: Response) {
    // Extract info from validated AuthInfo (provided by McpAuthGuard)
    const auth = req.auth;
    if (!auth || !auth.extra) {
      return res.status(401).send('Authentication missing');
    }

    const runId = auth.extra.runId as string;
    const organizationId = auth.extra.organizationId as string | null;

    if (!runId) {
      return res.status(400).send('runId missing in session token');
    }

    // Validate MCP Protocol Version if provided
    const protocolVersion = req.headers['mcp-protocol-version'];
    if (protocolVersion && protocolVersion !== '2025-06-18') {
      this.logger.warn(`Unsupported MCP protocol version: ${protocolVersion}`);
    }

    this.logger.log(`Establishing MCP Streamable HTTP connection for run: ${runId}`);

    const allowedToolsHeader = req.headers['x-allowed-tools'];
    const allowedTools =
      typeof allowedToolsHeader === 'string'
        ? allowedToolsHeader.split(',').map((t) => t.trim())
        : undefined;

    // Create a new transport for this specific run
    const transport = new StreamableHTTPServerTransport();
    this.transports.set(runId, transport);

    try {
      const server = await this.mcpGateway.getServerForRun(runId, organizationId, allowedTools);

      // Connect the server to this transport.
      await server.connect(transport);

      // Handle the initial GET request to start the SSE stream
      await transport.handleRequest(req, res);

      // Clean up when the client disconnects
      res.on('close', async () => {
        this.logger.log(`MCP connection closed for run: ${runId}`);
        this.transports.delete(runId);
        await this.mcpGateway.cleanupRun(runId);
      });
    } catch (error) {
      this.logger.error(`Failed to establish SSE connection: ${error}`);
      this.transports.delete(runId);
      if (!res.headersSent) {
        const statusCode = error instanceof Error && error.name === 'NotFoundException' ? 404 : 403;
        res.status(statusCode).send(error instanceof Error ? error.message : 'Access denied');
      }
    }
  }

  @Post('messages')
  @ApiOperation({ summary: 'Send an MCP message to an established connection' })
  @UseGuards(McpAuthGuard)
  async handleMessage(@Req() req: McpGatewayRequest, @Res() res: Response) {
    const auth = req.auth;
    if (!auth || !auth.extra) {
      return res.status(401).send('Authentication missing');
    }

    const runId = auth.extra.runId as string;
    const transport = this.transports.get(runId);

    if (!transport) {
      this.logger.warn(`Received MCP message for unknown or closed run: ${runId}`);
      return res.status(404).send('No active MCP connection for this runId');
    }

    // Process the POST message via the transport
    await transport.handleRequest(req, res);
  }
}
