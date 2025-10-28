import { describe, it, expect, vi, beforeEach, mock } from 'bun:test';
import '../../index';
import { ExecutionContext } from '@shipsec/component-sdk';
import { createMockExecutionContext } from '../../../testing/test-utils';

// Mock the Okta SDK
const mockUserApi = {
  getUser: vi.fn(),
  deactivateUser: vi.fn(),
  deleteUser: vi.fn(),
};

const mockClient = {
  userApi: mockUserApi,
};

mock.module('@okta/okta-sdk-nodejs', () => ({
  Client: vi.fn(() => mockClient),
  User: {},
  UserSchema: {},
}));

// Import the component definition
import '../okta-user-offboard';
import { componentRegistry } from '@shipsec/component-sdk';
import { OktaUserOffboardOutput } from '../okta-user-offboard';

const definition = componentRegistry.get('it-automation.okta.user-offboard');

if (!definition) {
  throw new Error('Component definition not found');
}

const execute = definition.execute as (
  params: any,
  context: ExecutionContext,
) => Promise<OktaUserOffboardOutput>;

describe('okta-user-offboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should successfully deactivate a user in a non-dry run', async () => {
    // 1. Set up mocks
    const mockSecrets = {
      get: vi.fn().mockResolvedValue({ value: 'test-api-token' }),
      list: vi.fn().mockResolvedValue([]),
    };

    const mockUser = {
      id: '12345',
      profile: {
        email: 'test@example.com',
        login: 'test@example.com',
      },
      status: 'ACTIVE',
      created: new Date('2023-01-01'),
      activated: new Date('2023-01-01'),
      lastLogin: new Date('2023-10-01'),
      lastUpdated: new Date('2023-10-01'),
    };

    mockUserApi.getUser.mockResolvedValue(mockUser);
    mockUserApi.deactivateUser.mockResolvedValue({});
    mockUserApi.deleteUser.mockResolvedValue({});

    // 2. Define input parameters
    const params = {
      user_email: 'test@example.com',
      okta_domain: 'company.okta.com',
      api_token_secret_id: 'okta-token-secret',
      action: 'deactivate',
      dry_run: false,
    };

    // 3. Create mock context
    const context = createMockExecutionContext({ secrets: mockSecrets });

    // 4. Execute the component
    const result: OktaUserOffboardOutput = await execute(params, context);

    // 5. Assert the results
    expect(result.success).toBe(true);
    expect(result.userDeactivated).toBe(true);
    expect(result.userDeleted).toBe(false);
    expect(result.message).toContain('Successfully deactivated user');
    expect(mockSecrets.get).toHaveBeenCalledWith('okta-token-secret');
    expect(mockUserApi.getUser).toHaveBeenCalledWith({ userId: 'test@example.com' });
    expect(mockUserApi.deactivateUser).toHaveBeenCalledWith({ userId: '12345' });
    expect(mockUserApi.deleteUser).not.toHaveBeenCalled();
    expect(context.logger.info).toHaveBeenCalledWith('[Okta] Successfully deactivated user account: test@example.com');
  });

  it('should successfully deactivate and delete a user in a non-dry run', async () => {
    // 1. Set up mocks
    const mockSecrets = {
      get: vi.fn().mockResolvedValue({ value: 'test-api-token' }),
      list: vi.fn().mockResolvedValue([]),
    };

    const mockUser = {
      id: '12345',
      profile: {
        email: 'test@example.com',
        login: 'test@example.com',
      },
      status: 'ACTIVE',
      created: new Date('2023-01-01'),
      activated: new Date('2023-01-01'),
      lastLogin: new Date('2023-10-01'),
      lastUpdated: new Date('2023-10-01'),
    };

    mockUserApi.getUser.mockResolvedValue(mockUser);
    mockUserApi.deactivateUser.mockResolvedValue({});
    mockUserApi.deleteUser.mockResolvedValue({});

    // 2. Define input parameters
    const params = {
      user_email: 'test@example.com',
      okta_domain: 'company.okta.com',
      api_token_secret_id: 'okta-token-secret',
      action: 'delete',
      dry_run: false,
    };

    // 3. Create mock context
    const context = createMockExecutionContext({ secrets: mockSecrets });

    // 4. Execute the component
    const result: OktaUserOffboardOutput = await execute(params, context);

    // 5. Assert the results
    expect(result.success).toBe(true);
    expect(result.userDeactivated).toBe(true);
    expect(result.userDeleted).toBe(true);
    expect(result.message).toContain('Successfully deactivated and deleted user');
    expect(mockSecrets.get).toHaveBeenCalledWith('okta-token-secret');
    expect(mockUserApi.getUser).toHaveBeenCalledWith({ userId: 'test@example.com' });
    expect(mockUserApi.deactivateUser).toHaveBeenCalledWith({ userId: '12345' });
    expect(mockUserApi.deleteUser).toHaveBeenCalledWith({ userId: '12345' });
  });

  it('should simulate deactivation in dry run mode', async () => {
    // 1. Set up mocks
    const mockSecrets = {
      get: vi.fn().mockResolvedValue({ value: 'test-api-token' }),
      list: vi.fn().mockResolvedValue([]),
    };

    const mockUser = {
      id: '12345',
      profile: {
        email: 'test@example.com',
        login: 'test@example.com',
      },
      status: 'ACTIVE',
      created: new Date('2023-01-01'),
      activated: new Date('2023-01-01'),
      lastLogin: new Date('2023-10-01'),
      lastUpdated: new Date('2023-10-01'),
    };

    mockUserApi.getUser.mockResolvedValue(mockUser);

    // 2. Define input parameters
    const params = {
      user_email: 'test@example.com',
      okta_domain: 'company.okta.com',
      api_token_secret_id: 'okta-token-secret',
      action: 'deactivate',
      dry_run: true,
    };

    // 3. Create mock context
    const context = createMockExecutionContext({ secrets: mockSecrets });

    // 4. Execute the component
    const result: OktaUserOffboardOutput = await execute(params, context);

    // 5. Assert the results
    expect(result.success).toBe(true);
    expect(result.userDeactivated).toBe(true);
    expect(result.userDeleted).toBe(false);
    expect(result.message).toContain('DRY RUN: Would deactivate user');
    expect(mockUserApi.deactivateUser).not.toHaveBeenCalled();
    expect(mockUserApi.deleteUser).not.toHaveBeenCalled();
    expect(context.logger.info).toHaveBeenCalledWith('[Okta] Running in DRY RUN mode - no changes will be made');
  });

  it('should simulate deactivation and deletion in dry run mode', async () => {
    // 1. Set up mocks
    const mockSecrets = {
      get: vi.fn().mockResolvedValue({ value: 'test-api-token' }),
      list: vi.fn().mockResolvedValue([]),
    };

    const mockUser = {
      id: '12345',
      profile: {
        email: 'test@example.com',
        login: 'test@example.com',
      },
      status: 'ACTIVE',
      created: new Date('2023-01-01'),
      activated: new Date('2023-01-01'),
      lastLogin: new Date('2023-10-01'),
      lastUpdated: new Date('2023-10-01'),
    };

    mockUserApi.getUser.mockResolvedValue(mockUser);

    // 2. Define input parameters
    const params = {
      user_email: 'test@example.com',
      okta_domain: 'company.okta.com',
      api_token_secret_id: 'okta-token-secret',
      action: 'delete',
      dry_run: true,
    };

    // 3. Create mock context
    const context = createMockExecutionContext({ secrets: mockSecrets });

    // 4. Execute the component
    const result: OktaUserOffboardOutput = await execute(params, context);

    // 5. Assert the results
    expect(result.success).toBe(true);
    expect(result.userDeactivated).toBe(true);
    expect(result.userDeleted).toBe(true);
    expect(result.message).toContain('DRY RUN: Would deactivate and delete user');
    expect(mockUserApi.deactivateUser).not.toHaveBeenCalled();
    expect(mockUserApi.deleteUser).not.toHaveBeenCalled();
  });

  it('should handle already deactivated user', async () => {
    // 1. Set up mocks
    const mockSecrets = {
      get: vi.fn().mockResolvedValue({ value: 'test-api-token' }),
      list: vi.fn().mockResolvedValue([]),
    };

    const mockUser = {
      id: '12345',
      profile: {
        email: 'test@example.com',
        login: 'test@example.com',
      },
      status: 'DEPROVISIONED',
      created: new Date('2023-01-01'),
      activated: new Date('2023-01-01'),
      lastLogin: new Date('2023-10-01'),
      lastUpdated: new Date('2023-10-01'),
    };

    mockUserApi.getUser.mockResolvedValue(mockUser);

    // 2. Define input parameters
    const params = {
      user_email: 'test@example.com',
      okta_domain: 'company.okta.com',
      api_token_secret_id: 'okta-token-secret',
      action: 'deactivate',
      dry_run: false,
    };

    // 3. Create mock context
    const context = createMockExecutionContext({ secrets: mockSecrets });

    // 4. Execute the component
    const result: OktaUserOffboardOutput = await execute(params, context);

    // 5. Assert the results
    expect(result.success).toBe(true);
    expect(result.userDeactivated).toBe(false);
    expect(result.userDeleted).toBe(false);
    expect(result.message).toContain('is already deactivated');
    expect(mockUserApi.deactivateUser).not.toHaveBeenCalled();
    expect(mockUserApi.deleteUser).not.toHaveBeenCalled();
  });

  it('should fail gracefully if user is not found', async () => {
    // 1. Set up mocks
    const mockSecrets = {
      get: vi.fn().mockResolvedValue({ value: 'test-api-token' }),
      list: vi.fn().mockResolvedValue([]),
    };

    const error = new Error('User not found');
    error.status = 404;
    mockUserApi.getUser.mockRejectedValue(error);

    // 2. Define input parameters
    const params = {
      user_email: 'notfound@example.com',
      okta_domain: 'company.okta.com',
      api_token_secret_id: 'okta-token-secret',
      action: 'deactivate',
    };

    // 3. Create mock context
    const context = createMockExecutionContext({ secrets: mockSecrets });

    // 4. Execute the component
    const result: OktaUserOffboardOutput = await execute(params, context);

    // 5. Assert the results
    expect(result.success).toBe(false);
    expect(result.userDeactivated).toBe(false);
    expect(result.userDeleted).toBe(false);
    expect(result.error).toContain('User notfound@example.com not found');
    expect(mockUserApi.deactivateUser).not.toHaveBeenCalled();
    expect(mockUserApi.deleteUser).not.toHaveBeenCalled();
  });

  it('should fail if secret is not found', async () => {
    // 1. Set up mocks
    const mockSecrets = {
      get: vi.fn().mockResolvedValue(null),
      list: vi.fn().mockResolvedValue([]),
    };

    // 2. Define input parameters
    const params = {
      user_email: 'test@example.com',
      okta_domain: 'company.okta.com',
      api_token_secret_id: 'invalid-secret',
      action: 'deactivate',
    };

    // 3. Create mock context
    const context = createMockExecutionContext({ secrets: mockSecrets });

    // 4. Execute the component
    const result: OktaUserOffboardOutput = await execute(params, context);

    // 5. Assert the results
    expect(result.success).toBe(false);
    expect(result.userDeactivated).toBe(false);
    expect(result.userDeleted).toBe(false);
    expect(result.error).toContain('not found or has no active version');
    expect(mockUserApi.getUser).not.toHaveBeenCalled();
    expect(mockUserApi.deactivateUser).not.toHaveBeenCalled();
    expect(mockUserApi.deleteUser).not.toHaveBeenCalled();
  });

  it('should fail if API token is invalid', async () => {
    // 1. Set up mocks
    const mockSecrets = {
      get: vi.fn().mockResolvedValue({ value: 'invalid-token' }),
      list: vi.fn().mockResolvedValue([]),
    };

    const error = new Error('Invalid token');
    error.status = 401;
    mockUserApi.getUser.mockRejectedValue(error);

    // 2. Define input parameters
    const params = {
      user_email: 'test@example.com',
      okta_domain: 'company.okta.com',
      api_token_secret_id: 'okta-token-secret',
      action: 'deactivate',
    };

    // 3. Create mock context
    const context = createMockExecutionContext({ secrets: mockSecrets });

    // 4. Execute the component
    const result: OktaUserOffboardOutput = await execute(params, context);

    // 5. Assert the results
    expect(result.success).toBe(false);
    expect(result.userDeactivated).toBe(false);
    expect(result.userDeleted).toBe(false);
    expect(result.error).toContain('Failed to get user details');
    expect(mockUserApi.deactivateUser).not.toHaveBeenCalled();
    expect(mockUserApi.deleteUser).not.toHaveBeenCalled();
  });

  it('should handle deactivation errors', async () => {
    // 1. Set up mocks
    const mockSecrets = {
      get: vi.fn().mockResolvedValue({ value: 'test-api-token' }),
      list: vi.fn().mockResolvedValue([]),
    };

    const mockUser = {
      id: '12345',
      profile: {
        email: 'test@example.com',
        login: 'test@example.com',
      },
      status: 'ACTIVE',
      created: new Date('2023-01-01'),
      activated: new Date('2023-01-01'),
      lastLogin: new Date('2023-10-01'),
      lastUpdated: new Date('2023-10-01'),
    };

    mockUserApi.getUser.mockResolvedValue(mockUser);

    const deactivationError = new Error('Permission denied');
    deactivationError.status = 403;
    mockUserApi.deactivateUser.mockRejectedValue(deactivationError);

    // 2. Define input parameters
    const params = {
      user_email: 'test@example.com',
      okta_domain: 'company.okta.com',
      api_token_secret_id: 'okta-token-secret',
      action: 'deactivate',
      dry_run: false,
    };

    // 3. Create mock context
    const context = createMockExecutionContext({ secrets: mockSecrets });

    // 4. Execute the component
    const result: OktaUserOffboardOutput = await execute(params, context);

    // 5. Assert the results
    expect(result.success).toBe(false);
    expect(result.userDeactivated).toBe(false);
    expect(result.userDeleted).toBe(false);
    expect(result.error).toContain('Failed to deactivate user');
    expect(mockUserApi.deleteUser).not.toHaveBeenCalled();
  });
});