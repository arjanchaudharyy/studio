import { describe, it, expect, beforeAll, afterEach, vi } from 'bun:test';
import { createExecutionContext } from '@shipsec/component-sdk';
import { componentRegistry } from '../../index';
import type {
  GitHubRemoveOrgMembershipInput,
  GitHubRemoveOrgMembershipOutput,
} from '../remove-org-membership';

describe('github.org.membership.remove component', () => {
  beforeAll(async () => {
    await import('../index');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is registered and removes a user by username', async () => {
    const component = componentRegistry.get<
      GitHubRemoveOrgMembershipInput,
      GitHubRemoveOrgMembershipOutput
    >('github.org.membership.remove');
    expect(component).toBeDefined();
    if (!component) throw new Error('Component not registered');

    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          device_code: 'device-123',
          user_code: 'ABCD-EFGH',
          verification_uri: 'https://github.com/login/device',
          verification_uri_complete: 'https://github.com/login/device?user_code=ABCD-EFGH',
          expires_in: 900,
          interval: 0,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'authorization_pending' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: 'token-123', scope: 'admin:org' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(null, {
        status: 204,
        statusText: 'No Content',
      }),
    );

    const context = createExecutionContext({
      runId: 'test-run',
      componentRef: 'github-remove',
    });

    const params = component.inputSchema.parse({
      organization: 'shipsecai',
      userIdentifier: 'octocat',
      clientId: 'client-id',
      clientSecret: 'client-secret',
    });

    const result = await component.execute(params, context);

    expect(result.removedFromOrganization).toBe(true);
    expect(result.resolvedLogin).toBe('octocat');
    expect(result.tokenScope).toBe('admin:org');
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/orgs/shipsecai/members/octocat',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('resolves email identifiers and handles already removed users', async () => {
    const component = componentRegistry.get<
      GitHubRemoveOrgMembershipInput,
      GitHubRemoveOrgMembershipOutput
    >('github.org.membership.remove');
    if (!component) throw new Error('Component not registered');

    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          device_code: 'device-123',
          user_code: 'ABCD-EFGH',
          verification_uri: 'https://github.com/login/device',
          expires_in: 900,
          interval: 0,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: 'token-456', scope: 'admin:org' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ total_count: 1, items: [{ login: 'octocat' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(null, {
        status: 404,
        statusText: 'Not Found',
      }),
    );

    const context = createExecutionContext({
      runId: 'test-run',
      componentRef: 'github-remove',
    });

    const params = component.inputSchema.parse({
      organization: 'shipsecai',
      userIdentifier: 'octocat@example.com',
      clientId: 'client-id',
      clientSecret: 'client-secret',
    });

    const result = await component.execute(params, context);

    expect(result.resolvedLogin).toBe('octocat');
    expect(result.removedFromOrganization).toBe(false);
    expect(result.organizationRemovalStatus).toBe('not_found');
    expect(result.tokenScope).toBe('admin:org');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('throws when team removal fails', async () => {
    const component = componentRegistry.get<
      GitHubRemoveOrgMembershipInput,
      GitHubRemoveOrgMembershipOutput
    >('github.org.membership.remove');
    if (!component) throw new Error('Component not registered');

    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          device_code: 'device-123',
          user_code: 'ABCD-EFGH',
          verification_uri: 'https://github.com/login/device',
          expires_in: 900,
          interval: 0,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: 'token-789', scope: 'admin:org' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(null, {
        status: 500,
        statusText: 'Server Error',
      }),
    );

    const context = createExecutionContext({
      runId: 'test-run',
      componentRef: 'github-remove',
    });

    const params = component.inputSchema.parse({
      organization: 'shipsecai',
      teamSlug: 'infra',
      userIdentifier: 'octocat',
      clientId: 'client-id',
      clientSecret: 'client-secret',
    });

    await expect(component.execute(params, context)).rejects.toThrow(
      /Failed to remove octocat from team infra/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
