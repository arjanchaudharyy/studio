import { describe, it, expect, vi, beforeEach, mock } from 'bun:test';
import { componentRegistry } from '@shipsec/component-sdk';
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

// Import the component after mocking
import '../okta-user-offboard';

describe('Okta User Offboard - Retry Behavior Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw proper non-retryable errors for component execution failures', async () => {
    // Get the component definition
    const definition = componentRegistry.get('it-automation.okta.user-offboard');
    if (!definition) {
      throw new Error('Component definition not found');
    }

    const execute = definition.execute;

    // Test 1: User not found - should return structured failure, not throw
    {
      vi.clearAllMocks();

      const mockSecrets = {
        get: vi.fn().mockResolvedValue({ value: 'test-api-token' }),
        list: vi.fn().mockResolvedValue([]),
      };

      const error = new Error('User not found');
      error.status = 404;
      mockUserApi.getUser.mockRejectedValue(error);

      const context = createMockExecutionContext({
        secrets: mockSecrets
      });

      // This should NOT throw - it should return a structured failure
      const result = await execute({
        user_email: 'notfound@example.com',
        okta_domain: 'company.okta.com',
        api_token_secret_id: 'okta-token-secret',
        action: 'deactivate',
        dry_run: false,
      }, context);

      // Verify the component handles the error gracefully
      expect(result.success).toBe(false);
      expect(result.error).toContain('User notfound@example.com not found');
      expect(result.userDeactivated).toBe(false);
      expect(result.userDeleted).toBe(false);

      // Should only call once, no retries
      expect(mockUserApi.getUser).toHaveBeenCalledTimes(1);
      expect(mockUserApi.deactivateUser).not.toHaveBeenCalled();
    }

    // Test 2: Secret not found - should return structured failure, not throw
    {
      vi.clearAllMocks();

      const mockSecrets = {
        get: vi.fn().mockResolvedValue(null), // Secret not found
        list: vi.fn().mockResolvedValue([]),
      };

      const context = createMockExecutionContext({
        secrets: mockSecrets
      });

      // This should NOT throw - it should return a structured failure
      const result = await execute({
        user_email: 'test@example.com',
        okta_domain: 'company.okta.com',
        api_token_secret_id: 'invalid-secret',
        action: 'deactivate',
        dry_run: false,
      }, context);

      // Verify the component handles the error gracefully
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found or has no active version');
      expect(result.userDeactivated).toBe(false);
      expect(result.userDeleted).toBe(false);

      // Should not attempt any API calls
      expect(mockUserApi.getUser).not.toHaveBeenCalled();
      expect(mockUserApi.deactivateUser).not.toHaveBeenCalled();
    }

    // Test 3: Invalid API token - should return structured failure, not throw
    {
      vi.clearAllMocks();

      const mockSecrets = {
        get: vi.fn().mockResolvedValue({ value: 'invalid-token' }),
        list: vi.fn().mockResolvedValue([]),
      };

      const error = new Error('Invalid token');
      error.status = 401;
      mockUserApi.getUser.mockRejectedValue(error);

      const context = createMockExecutionContext({
        secrets: mockSecrets
      });

      // This should NOT throw - it should return a structured failure
      const result = await execute({
        user_email: 'test@example.com',
        okta_domain: 'company.okta.com',
        api_token_secret_id: 'okta-token-secret',
        action: 'deactivate',
        dry_run: false,
      }, context);

      // Verify the component handles the error gracefully
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to get user details');
      expect(result.userDeactivated).toBe(false);
      expect(result.userDeleted).toBe(false);

      // Should only call once, no retries
      expect(mockUserApi.getUser).toHaveBeenCalledTimes(1);
      expect(mockUserApi.deactivateUser).not.toHaveBeenCalled();
    }

    console.log('✅ All error scenarios return structured failures without throwing');
  });

  it('should execute successfully when everything is valid', async () => {
    // Get the component definition
    const definition = componentRegistry.get('it-automation.okta.user-offboard');
    if (!definition) {
      throw new Error('Component definition not found');
    }

    const execute = definition.execute;

    // Set up successful mocks
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

    const context = createMockExecutionContext({
      secrets: mockSecrets
    });

    // Execute successfully
    const result = await execute({
      user_email: 'test@example.com',
      okta_domain: 'company.okta.com',
      api_token_secret_id: 'okta-token-secret',
      action: 'deactivate',
      dry_run: false,
    }, context);

    // Verify success
    expect(result.success).toBe(true);
    expect(result.userDeactivated).toBe(true);
    expect(result.userDeleted).toBe(false);
    expect(result.message).toContain('Successfully deactivated user');

    // Verify API calls were made exactly once
    expect(mockUserApi.getUser).toHaveBeenCalledTimes(1);
    expect(mockUserApi.deactivateUser).toHaveBeenCalledTimes(1);

    console.log('✅ Successful execution works correctly');
  });

  it('should handle dry run mode correctly', async () => {
    // Get the component definition
    const definition = componentRegistry.get('it-automation.okta.user-offboard');
    if (!definition) {
      throw new Error('Component definition not found');
    }

    const execute = definition.execute;

    // Set up successful mocks
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

    const context = createMockExecutionContext({
      secrets: mockSecrets
    });

    // Execute in dry run mode
    const result = await execute({
      user_email: 'test@example.com',
      okta_domain: 'company.okta.com',
      api_token_secret_id: 'okta-token-secret',
      action: 'deactivate',
      dry_run: true,
    }, context);

    // Verify dry run success
    expect(result.success).toBe(true);
    expect(result.userDeactivated).toBe(true); // Simulated
    expect(result.userDeleted).toBe(false);
    expect(result.message).toContain('DRY RUN: Would deactivate user');
    expect(result.audit.dryRun).toBe(true);

    // Verify only getUser was called, no mutations
    expect(mockUserApi.getUser).toHaveBeenCalledTimes(1);
    expect(mockUserApi.deactivateUser).not.toHaveBeenCalled();
    expect(mockUserApi.deleteUser).not.toHaveBeenCalled();

    console.log('✅ Dry run mode works correctly');
  });

  it('should verify that component errors are NOT retryable', async () => {
    // Get the component definition
    const definition = componentRegistry.get('it-automation.okta.user-offboard');
    if (!definition) {
      throw new Error('Component definition not found');
    }

    const execute = definition.execute;

    // The key test: verify that errors don't have retryable property
    const mockSecrets = {
      get: vi.fn().mockResolvedValue(null), // Force secret error
      list: vi.fn().mockResolvedValue([]),
    };

    const context = createMockExecutionContext({
      secrets: mockSecrets
    });

    // Execute with invalid secret
    const result = await execute({
      user_email: 'test@example.com',
      okta_domain: 'company.okta.com',
      api_token_secret_id: 'invalid-secret',
      action: 'deactivate',
      dry_run: false,
    }, context);

    // Verify the error is structured and non-retryable
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();

    // The component should NOT set any retryable property
    expect((result as any).retryable).toBeUndefined();

    // The result should be a plain object, not an Error with retryable
    expect(result).not.toHaveProperty('retryable');

    console.log('✅ Component errors are not retryable (no retryable property)');
  });
});