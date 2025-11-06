import type { Request } from 'express';
import { Injectable, UnauthorizedException } from '@nestjs/common';

import type { LocalAuthConfig } from '../../config/auth.config';
import { DEFAULT_ROLES, type AuthContext } from '../types';
import type { AuthProviderStrategy } from './auth-provider.interface';
import { DEFAULT_ORGANIZATION_ID } from '../constants';

function extractBearerToken(headerValue: string | undefined): string | null {
  if (!headerValue) {
    return null;
  }
  const [scheme, token] = headerValue.split(' ');
  if (!scheme || !token) {
    return null;
  }
  if (scheme.toLowerCase() !== 'bearer') {
    return null;
  }
  return token.trim();
}

function extractOrganizationId(request: Request): string | null {
  const header =
    (request.headers['x-organization-id'] as string | undefined) ??
    (request.headers['x-org-id'] as string | undefined);
  if (header && header.trim().length > 0) {
    return header.trim();
  }
  return null;
}

@Injectable()
export class LocalAuthProvider implements AuthProviderStrategy {
  readonly name = 'local';

  constructor(private readonly config: LocalAuthConfig) {}

  async authenticate(request: Request): Promise<AuthContext> {
    const orgId = extractOrganizationId(request) ?? DEFAULT_ORGANIZATION_ID;

    if (this.config.apiKey) {
      const token = extractBearerToken(request.headers.authorization);
      if (token === this.config.apiKey) {
        return {
          userId: 'local-api-key',
          organizationId: orgId,
          roles: DEFAULT_ROLES,
          isAuthenticated: true,
          provider: this.name,
        };
      }
      if (!this.config.allowUnauthenticated) {
        throw new UnauthorizedException('Invalid or missing API key');
      }
    }

    if (!this.config.allowUnauthenticated && !this.config.apiKey) {
      throw new UnauthorizedException('Local auth is locked down without an API key');
    }

    return {
      userId: null,
      organizationId: orgId,
      roles: DEFAULT_ROLES,
      isAuthenticated: false,
      provider: this.name,
    };
  }
}
