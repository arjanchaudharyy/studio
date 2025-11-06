import { registerAs } from '@nestjs/config';

export type AuthProvider = 'local' | 'clerk';

export interface LocalAuthConfig {
  apiKey: string | null;
  allowUnauthenticated: boolean;
}

export interface ClerkAuthConfig {
  publishableKey: string | null;
  secretKey: string | null;
}

export interface AuthConfig {
  provider: AuthProvider;
  local: LocalAuthConfig;
  clerk: ClerkAuthConfig;
}

function parseBoolean(value: string | undefined, fallback = false): boolean {
  if (value === undefined || value === null) {
    return fallback;
  }
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function normalizeProvider(raw: string | undefined): AuthProvider {
  if (!raw) {
    return 'local';
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === 'clerk' ? 'clerk' : 'local';
}

export const authConfig = registerAs<AuthConfig>('auth', () => {
  const provider = normalizeProvider(process.env.AUTH_PROVIDER);

  return {
    provider,
    local: {
      apiKey: process.env.AUTH_LOCAL_API_KEY ?? null,
      allowUnauthenticated: parseBoolean(
        process.env.AUTH_LOCAL_ALLOW_UNAUTHENTICATED,
        true,
      ),
    },
    clerk: {
      publishableKey: process.env.CLERK_PUBLISHABLE_KEY ?? null,
      secretKey: process.env.CLERK_SECRET_KEY ?? null,
    },
  };
});
