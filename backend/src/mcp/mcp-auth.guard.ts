import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';
import { McpAuthService } from './mcp-auth.service';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';

/**
 * Request interface for MCP Gateway which uses spec-compliant AuthInfo
 */
export interface McpGatewayRequest extends Request {
  auth?: AuthInfo;
}

@Injectable()
export class McpAuthGuard implements CanActivate {
  private readonly logger = new Logger(McpAuthGuard.name);

  constructor(private readonly mcpAuthService: McpAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<McpGatewayRequest>();

    const authHeader = request.headers['authorization'];
    if (!authHeader || typeof authHeader !== 'string') {
      this.logger.warn('Missing Authorization header for MCP request');
      throw new UnauthorizedException('Authorization header required');
    }

    if (!authHeader.startsWith('Bearer ')) {
      this.logger.warn('Invalid Authorization format for MCP request');
      throw new UnauthorizedException('Bearer token required');
    }

    const token = authHeader.substring(7);
    const authInfo = await this.mcpAuthService.validateToken(token);

    if (!authInfo) {
      this.logger.warn('Invalid or expired MCP session token');
      throw new UnauthorizedException('Invalid or expired session token');
    }

    // Attach spec-compliant auth info to request
    request.auth = authInfo;

    return true;
  }
}
