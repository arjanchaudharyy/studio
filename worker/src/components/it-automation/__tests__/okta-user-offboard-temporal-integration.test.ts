import { describe, it, expect, vi, beforeEach, mock } from 'bun:test';
import { runComponentActivity } from '../../../temporal/activities/run-component.activity';
import { createMockSecretsService, createMockTrace, createMockLogCollector } from '../../../testing/test-utils';

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

// Ensure all components are registered
import '../../index';

describe('Okta User Offboard - Temporal Activity Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should successfully deactivate user through temporal activity', async () => {
    // Set up mocks
    const mockSecretsService = createMockSecretsService({ 'okta-token-secret': 'test-api-token' });

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

    const trace = createMockTrace();
    const logCollector = createMockLogCollector();

    // Initialize the global services for the activity
    const { initializeComponentActivityServices } = await import('../../../temporal/activities/run-component.activity');
    initializeComponentActivityServices({
      storage: undefined as any,
      secrets: mockSecretsService,
      trace: {
        record: (event) => {
          console.log('TRACE:', event.type, event.nodeRef, event.message);
        },
        flush: async () => {},
        setRunMetadata: () => {},
        finalizeRun: () => {},
      },
      logs: {
        append: async (log) => {
          console.log('LOG:', log.level, log.message);
        },
      },
    });

    // Execute through temporal activity (like the real workflow system)
    const result = await runComponentActivity({
      runId: 'test-run-1',
      workflowId: 'test-workflow-1',
      action: {
        ref: 'okta-offboard',
        componentId: 'it-automation.okta.user-offboard',
      },
      params: {
        user_email: 'test@example.com',
        okta_domain: 'company.okta.com',
        api_token_secret_id: 'okta-token-secret',
        action: 'deactivate',
        dry_run: false,
      },
      metadata: {
        streamId: 'test-stream',
        joinStrategy: 'all',
        triggeredBy: undefined,
        failure: undefined,
      },
    });

    // Assertions
    expect(result.success).toBe(true);
    expect(result.output.success).toBe(true);
    expect(result.output.userDeactivated).toBe(true);
    expect(result.output.userDeleted).toBe(false);
    expect(result.output.message).toContain('Successfully deactivated user');

    // Verify API calls were made exactly once
    expect(mockUserApi.getUser).toHaveBeenCalledTimes(1);
    expect(mockUserApi.deactivateUser).toHaveBeenCalledTimes(1);
    expect(mockUserApi.deleteUser).not.toHaveBeenCalled();

    console.log('✅ Temporal activity completed successfully');
  });

  it('should fail gracefully and NOT retry when user not found', async () => {
    // Set up mocks to simulate user not found
    const mockSecretsService = createMockSecretsService({ 'okta-token-secret': 'test-api-token' });

    const error = new Error('User not found');
    error.status = 404;
    mockUserApi.getUser.mockRejectedValue(error);

    const trace = createMockTrace();
    const logCollector = createMockLogCollector();

    // Mock time to detect retry loops
    const startTime = Date.now();

    // Execute through temporal activity
    const result = await runComponentActivity({
      componentId: 'it-automation.okta.user-offboard',
      params: {
        user_email: 'notfound@example.com',
        okta_domain: 'company.okta.com',
        api_token_secret_id: 'okta-token-secret',
        action: 'deactivate',
        dry_run: false,
      },
      runId: 'test-run-fail-1',
      componentRef: 'okta-offboard',
      secrets: mockSecretsService,
      trace,
      logCollector,
    });

    const endTime = Date.now();
    const executionTime = endTime - startTime;

    // Assertions
    expect(result.success).toBe(false);
    expect(result.output.success).toBe(false);
    expect(result.output.userDeactivated).toBe(false);
    expect(result.output.userDeleted).toBe(false);
    expect(result.output.error).toContain('User notfound@example.com not found');

    // CRITICAL: Verify no retry loops occurred
    expect(executionTime).toBeLessThan(2000); // Should complete quickly

    // Should only call getUser once, no retries
    expect(mockUserApi.getUser).toHaveBeenCalledTimes(1);
    expect(mockUserApi.deactivateUser).not.toHaveBeenCalled();
    expect(mockUserApi.deleteUser).not.toHaveBeenCalled();

    console.log('✅ Temporal activity failed gracefully without retries');
  });

  it('should fail gracefully and NOT retry when secret is invalid', async () => {
    // Set up mocks to simulate secret failure (empty)
    const mockSecretsService = createMockSecretsService({}); // No secrets

    const trace = createMockTrace();
    const logCollector = createMockLogCollector();

    // Mock time to detect retry loops
    const startTime = Date.now();

    // Execute through temporal activity
    const result = await runComponentActivity({
      componentId: 'it-automation.okta.user-offboard',
      params: {
        user_email: 'test@example.com',
        okta_domain: 'company.okta.com',
        api_token_secret_id: 'invalid-secret',
        action: 'deactivate',
        dry_run: false,
      },
      runId: 'test-run-fail-2',
      componentRef: 'okta-offboard',
      secrets: mockSecretsService,
      trace,
      logCollector,
    });

    const endTime = Date.now();
    const executionTime = endTime - startTime;

    // Assertions
    expect(result.success).toBe(false);
    expect(result.output.success).toBe(false);
    expect(result.output.userDeactivated).toBe(false);
    expect(result.output.userDeleted).toBe(false);
    expect(result.output.error).toContain('not found or has no active version');

    // CRITICAL: Verify no retry loops occurred
    expect(executionTime).toBeLessThan(2000); // Should complete quickly

    // Should not attempt any API calls
    expect(mockUserApi.getUser).not.toHaveBeenCalled();
    expect(mockUserApi.deactivateUser).not.toHaveBeenCalled();
    expect(mockUserApi.deleteUser).not.toHaveBeenCalled();

    console.log('✅ Temporal activity failed gracefully without retries when secret invalid');
  });

  it('should fail gracefully and NOT retry when API token is invalid', async () => {
    // Set up mocks to simulate invalid API token
    const mockSecretsService = createMockSecretsService({ 'okta-token-secret': 'invalid-token' });

    const error = new Error('Invalid token');
    error.status = 401;
    mockUserApi.getUser.mockRejectedValue(error);

    const trace = createMockTrace();
    const logCollector = createMockLogCollector();

    // Mock time to detect retry loops
    const startTime = Date.now();

    // Execute through temporal activity
    const result = await runComponentActivity({
      componentId: 'it-automation.okta.user-offboard',
      params: {
        user_email: 'test@example.com',
        okta_domain: 'company.okta.com',
        api_token_secret_id: 'okta-token-secret',
        action: 'deactivate',
        dry_run: false,
      },
      runId: 'test-run-fail-3',
      componentRef: 'okta-offboard',
      secrets: mockSecretsService,
      trace,
      logCollector,
    });

    const endTime = Date.now();
    const executionTime = endTime - startTime;

    // Assertions
    expect(result.success).toBe(false);
    expect(result.output.success).toBe(false);
    expect(result.output.userDeactivated).toBe(false);
    expect(result.output.userDeleted).toBe(false);
    expect(result.output.error).toContain('Failed to get user details');

    // CRITICAL: Verify no retry loops occurred
    expect(executionTime).toBeLessThan(2000); // Should complete quickly

    // Should only call getUser once, no retries
    expect(mockUserApi.getUser).toHaveBeenCalledTimes(1);
    expect(mockUserApi.deactivateUser).not.toHaveBeenCalled();
    expect(mockUserApi.deleteUser).not.toHaveBeenCalled();

    console.log('✅ Temporal activity failed gracefully without retries when auth fails');
  });

  it('should work correctly in dry run mode through temporal activity', async () => {
    // Set up mocks
    const mockSecretsService = createMockSecretsService({ 'okta-token-secret': 'test-api-token' });

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

    const trace = createMockTrace();
    const logCollector = createMockLogCollector();

    // Execute through temporal activity in dry run mode
    const result = await runComponentActivity({
      componentId: 'it-automation.okta.user-offboard',
      params: {
        user_email: 'test@example.com',
        okta_domain: 'company.okta.com',
        api_token_secret_id: 'okta-token-secret',
        action: 'deactivate',
        dry_run: true,
      },
      runId: 'test-run-dry',
      componentRef: 'okta-offboard',
      secrets: mockSecretsService,
      trace,
      logCollector,
    });

    // Assertions
    expect(result.success).toBe(true);
    expect(result.output.success).toBe(true);
    expect(result.output.userDeactivated).toBe(true); // Simulated
    expect(result.output.userDeleted).toBe(false);
    expect(result.output.message).toContain('DRY RUN: Would deactivate user');
    expect(result.output.audit.dryRun).toBe(true);

    // Verify only getUser was called, no mutations
    expect(mockUserApi.getUser).toHaveBeenCalledTimes(1);
    expect(mockUserApi.deactivateUser).not.toHaveBeenCalled();
    expect(mockUserApi.deleteUser).not.toHaveBeenCalled();

    console.log('✅ Dry run mode works correctly through temporal activity');
  });

  it('should work with delete action through temporal activity', async () => {
    // Set up mocks
    const mockSecretsService = createMockSecretsService({ 'okta-token-secret': 'test-api-token' });

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

    const trace = createMockTrace();
    const logCollector = createMockLogCollector();

    // Execute delete action through temporal activity
    const result = await runComponentActivity({
      componentId: 'it-automation.okta.user-offboard',
      params: {
        user_email: 'test@example.com',
        okta_domain: 'company.okta.com',
        api_token_secret_id: 'okta-token-secret',
        action: 'delete',
        dry_run: false,
      },
      runId: 'test-run-delete',
      componentRef: 'okta-offboard',
      secrets: mockSecretsService,
      trace,
      logCollector,
    });

    // Assertions
    expect(result.success).toBe(true);
    expect(result.output.success).toBe(true);
    expect(result.output.userDeactivated).toBe(true);
    expect(result.output.userDeleted).toBe(true);
    expect(result.output.message).toContain('Successfully deactivated and deleted user');

    // Verify all API calls were made exactly once
    expect(mockUserApi.getUser).toHaveBeenCalledTimes(1);
    expect(mockUserApi.deactivateUser).toHaveBeenCalledTimes(1);
    expect(mockUserApi.deleteUser).toHaveBeenCalledTimes(1);

    console.log('✅ Delete action works correctly through temporal activity');
  });

  it('should handle already deactivated user through temporal activity', async () => {
    // Set up mocks
    const mockSecretsService = createMockSecretsService({ 'okta-token-secret': 'test-api-token' });

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

    const trace = createMockTrace();
    const logCollector = createMockLogCollector();

    // Execute through temporal activity
    const result = await runComponentActivity({
      componentId: 'it-automation.okta.user-offboard',
      params: {
        user_email: 'test@example.com',
        okta_domain: 'company.okta.com',
        api_token_secret_id: 'okta-token-secret',
        action: 'deactivate',
        dry_run: false,
      },
      runId: 'test-run-already-deactivated',
      componentRef: 'okta-offboard',
      secrets: mockSecretsService,
      trace,
      logCollector,
    });

    // Assertions
    expect(result.success).toBe(true);
    expect(result.output.success).toBe(true);
    expect(result.output.userDeactivated).toBe(false);
    expect(result.output.userDeleted).toBe(false);
    expect(result.output.message).toContain('is already deactivated');

    // Verify only getUser was called, no mutations
    expect(mockUserApi.getUser).toHaveBeenCalledTimes(1);
    expect(mockUserApi.deactivateUser).not.toHaveBeenCalled();
    expect(mockUserApi.deleteUser).not.toHaveBeenCalled();

    console.log('✅ Already deactivated user handled correctly through temporal activity');
  });
});