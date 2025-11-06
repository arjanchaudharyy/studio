export type AuthRole = 'ADMIN' | 'MEMBER';

export interface AuthContext {
  userId: string | null;
  organizationId: string | null;
  roles: AuthRole[];
  isAuthenticated: boolean;
  provider: string;
}

export const DEFAULT_ROLES: AuthRole[] = ['ADMIN', 'MEMBER'];
