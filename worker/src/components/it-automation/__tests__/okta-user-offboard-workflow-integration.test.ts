import { describe, it, expect, vi, beforeEach, mock } from 'bun:test';
import { executeWorkflow } from '../../../temporal/workflow-runner';
import type { WorkflowDefinition } from '../../../temporal/types';
import type { TraceEvent } from '@shipsec/component-sdk';

// Mock the Okta SDK at the global level
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

describe('Okta User Offboard - Workflow Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createTestWorkflow = (params: any): WorkflowDefinition => ({
    version: 1,
    title: 'Okta Offboard Test',
    description: 'Test Okta user offboarding through workflow runner',
    entrypoint: { ref: 'okta-offboard' },
    config: {
      environment: 'test',
      timeoutSeconds: 30,
    },
    nodes: {
      'okta-offboard': { ref: 'okta-offboard' },
    },
    edges: [],
    dependencyCounts: {
      'okta-offboard': 0,
    },
    actions: [
      {
        ref: 'okta-offboard',
        componentId: 'it-automation.okta.user-offboard',
        params,
        dependsOn: [],
        inputMappings: {},
      },
    ],
  });

  const createTestSecretsService = (shouldFail: boolean = false, errorType: string = 'secret-not-found') => {
    if (shouldFail) {
      return {
        get: vi.fn().mockResolvedValue(null),
        list: vi.fn().mockResolvedValue([]),
      };
    }
    return {
      get: vi.fn().mockResolvedValue({ value: 'test-api-token' }),
      list: vi.fn().mockResolvedValue([]),
    };
  };

  it('should successfully deactivate user through workflow runner', async () => {
    // Set up mocks
    const mockSecretsService = createTestSecretsService(false);

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

    // Mock the secrets service injection
    vi.mock('../../../temporal/activities/run-component.activity', async () => {
      const actual = await vi.importActual<typeof import('../../../temporal/activities/run-component.activity')>('../../../temporal/activities/run-component.activity');
      return {
        ...actual,
        // We'll let the actual implementation run, but with our mocked secrets
      };
    });

    const traceEvents: TraceEvent[] = [];
    const trace = {
      record: (event: TraceEvent) => {
        traceEvents.push(event);
        console.log('TRACE EVENT:', event.type, event.nodeRef, event.message);
      },
    };

    // Create workflow
    const workflow = createTestWorkflow({
      user_email: 'test@example.com',
      okta_domain: 'company.okta.com',
      api_token_secret_id: 'okta-token-secret',
      action: 'deactivate',
      dry_run: false,
    });

    // Execute workflow
    const result = await executeWorkflow(workflow, {}, {
      runId: 'okta-integration-test',
      trace,
      secrets: mockSecretsService,
    });

    // Assertions
    expect(result.success).toBe(true);
    expect(result.outputs).toBeDefined();

    const output = result.outputs['okta-offboard'] as any;
    expect(output.success).toBe(true);
    expect(output.userDeactivated).toBe(true);
    expect(output.userDeleted).toBe(false);
    expect(output.message).toContain('Successfully deactivated user');

    // Verify API calls were made
    expect(mockUserApi.getUser).toHaveBeenCalledWith({ userId: 'test@example.com' });
    expect(mockUserApi.deactivateUser).toHaveBeenCalledWith({ userId: '12345' });
    expect(mockUserApi.deleteUser).not.toHaveBeenCalled();

    console.log('✅ Workflow completed successfully');
  });

  it('should fail gracefully and NOT retry when user not found', async () => {
    // Set up mocks to simulate user not found
    const mockSecretsService = createTestSecretsService(false);

    const error = new Error('User not found');
    error.status = 404;
    mockUserApi.getUser.mockRejectedValue(error);

    const traceEvents: TraceEvent[] = [];
    const trace = {
      record: (event: TraceEvent) => {
        traceEvents.push(event);
        console.log('TRACE EVENT:', event.type, event.nodeRef, event.message, event.level);
      },
    };

    // Create workflow
    const workflow = createTestWorkflow({
      user_email: 'notfound@example.com',
      okta_domain: 'company.okta.com',
      api_token_secret_id: 'okta-token-secret',
      action: 'deactivate',
      dry_run: false,
    });

    // Mock time to prevent infinite test in case of retries
    const startTime = Date.now();

    // Execute workflow
    const result = await executeWorkflow(workflow, {}, {
      runId: 'okta-integration-test-fail',
      trace,
      secrets: mockSecretsService,
    });

    const endTime = Date.now();
    const executionTime = endTime - startTime;

    // Assertions
    expect(result.success).toBe(false);
    expect(result.error).toContain('One or more workflow actions failed');

    const output = result.outputs['okta-offboard'] as any;
    expect(output.success).toBe(false);
    expect(output.userDeactivated).toBe(false);
    expect(output.userDeleted).toBe(false);
    expect(output.error).toContain('User notfound@example.com not found');

    // CRITICAL: Verify no retry loops occurred
    expect(executionTime).toBeLessThan(5000); // Should complete quickly, not get stuck in retries

    // Should only call getUser once, no retries
    expect(mockUserApi.getUser).toHaveBeenCalledTimes(1);
    expect(mockUserApi.deactivateUser).not.toHaveBeenCalled();
    expect(mockUserApi.deleteUser).not.toHaveBeenCalled();

    console.log('✅ Workflow failed gracefully without retries');
  });

  it('should fail gracefully and NOT retry when secret is invalid', async () => {
    // Set up mocks to simulate secret failure
    const mockSecretsService = createTestSecretsService(true, 'secret-not-found');

    const traceEvents: TraceEvent[] = [];
    const trace = {
      record: (event: TraceEvent) => {
        traceEvents.push(event);
        console.log('TRACE EVENT:', event.type, event.nodeRef, event.message, event.level);
      },
    };

    // Create workflow
    const workflow = createTestWorkflow({
      user_email: 'test@example.com',
      okta_domain: 'company.okta.com',
      api_token_secret_id: 'invalid-secret',
      action: 'deactivate',
      dry_run: false,
    });

    // Mock time to prevent infinite test in case of retries
    const startTime = Date.now();

    // Execute workflow
    const result = await executeWorkflow(workflow, {}, {
      runId: 'okta-integration-test-secret-fail',
      trace,
      secrets: mockSecretsService,
    });

    const endTime = Date.now();
    const executionTime = endTime - startTime;

    // Assertions
    expect(result.success).toBe(false);
    expect(result.error).toContain('One or more workflow actions failed');

    const output = result.outputs['okta-offboard'] as any;
    expect(output.success).toBe(false);
    expect(output.userDeactivated).toBe(false);
    expect(output.userDeleted).toBe(false);
    expect(output.error).toContain('not found or has no active version');

    // CRITICAL: Verify no retry loops occurred
    expect(executionTime).toBeLessThan(5000); // Should complete quickly, not get stuck in retries

    // Should not attempt any API calls
    expect(mockUserApi.getUser).not.toHaveBeenCalled();
    expect(mockUserApi.deactivateUser).not.toHaveBeenCalled();
    expect(mockUserApi.deleteUser).not.toHaveBeenCalled();

    console.log('✅ Workflow failed gracefully without retries when secret invalid');
  });

  it('should fail gracefully and NOT retry when API token is invalid', async () => {
    // Set up mocks to simulate invalid API token
    const mockSecretsService = createTestSecretsService(false);

    const error = new Error('Invalid token');
    error.status = 401;
    mockUserApi.getUser.mockRejectedValue(error);

    const traceEvents: TraceEvent[] = [];
    const trace = {
      record: (event: TraceEvent) => {
        traceEvents.push(event);
        console.log('TRACE EVENT:', event.type, event.nodeRef, event.message, event.level);
      },
    };

    // Create workflow
    const workflow = createTestWorkflow({
      user_email: 'test@example.com',
      okta_domain: 'company.okta.com',
      api_token_secret_id: 'okta-token-secret',
      action: 'deactivate',
      dry_run: false,
    });

    // Mock time to prevent infinite test in case of retries
    const startTime = Date.now();

    // Execute workflow
    const result = await executeWorkflow(workflow, {}, {
      runId: 'okta-integration-test-auth-fail',
      trace,
      secrets: mockSecretsService,
    });

    const endTime = Date.now();
    const executionTime = endTime - startTime;

    // Assertions
    expect(result.success).toBe(false);
    expect(result.error).toContain('One or more workflow actions failed');

    const output = result.outputs['okta-offboard'] as any;
    expect(output.success).toBe(false);
    expect(output.userDeactivated).toBe(false);
    expect(output.userDeleted).toBe(false);
    expect(output.error).toContain('Failed to get user details');

    // CRITICAL: Verify no retry loops occurred
    expect(executionTime).toBeLessThan(5000); // Should complete quickly, not get stuck in retries

    // Should only call getUser once, no retries
    expect(mockUserApi.getUser).toHaveBeenCalledTimes(1);
    expect(mockUserApi.deactivateUser).not.toHaveBeenCalled();
    expect(mockUserApi.deleteUser).not.toHaveBeenCalled();

    console.log('✅ Workflow failed gracefully without retries when auth fails');
  });

  it('should work correctly in dry run mode through workflow', async () => {
    // Set up mocks
    const mockSecretsService = createTestSecretsService(false);

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

    const traceEvents: TraceEvent[] = [];
    const trace = {
      record: (event: TraceEvent) => {
        traceEvents.push(event);
        console.log('TRACE EVENT:', event.type, event.nodeRef, event.message);
      },
    };

    // Create workflow in dry run mode
    const workflow = createTestWorkflow({
      user_email: 'test@example.com',
      okta_domain: 'company.okta.com',
      api_token_secret_id: 'okta-token-secret',
      action: 'deactivate',
      dry_run: true,
    });

    // Execute workflow
    const result = await executeWorkflow(workflow, {}, {
      runId: 'okta-integration-test-dry-run',
      trace,
      secrets: mockSecretsService,
    });

    // Assertions
    expect(result.success).toBe(true);

    const output = result.outputs['okta-offboard'] as any;
    expect(output.success).toBe(true);
    expect(output.userDeactivated).toBe(true); // Simulated
    expect(output.userDeleted).toBe(false);
    expect(output.message).toContain('DRY RUN: Would deactivate user');
    expect(output.audit.dryRun).toBe(true);

    // Verify only getUser was called, no mutations
    expect(mockUserApi.getUser).toHaveBeenCalledWith({ userId: 'test@example.com' });
    expect(mockUserApi.deactivateUser).not.toHaveBeenCalled();
    expect(mockUserApi.deleteUser).not.toHaveBeenCalled();

    console.log('✅ Dry run mode works correctly through workflow');
  });
});