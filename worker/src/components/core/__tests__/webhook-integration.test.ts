/**
 * Integration test for Webhook component with real HTTP endpoints
 */
import { describe, test, expect } from 'bun:test';
import { componentRegistry } from '@shipsec/component-sdk';
import type { ExecutionContext } from '@shipsec/component-sdk';
import '../../index'; // Register all components

describe('Webhook Integration (Real HTTP)', () => {
  const context: ExecutionContext = {
    runId: 'test-run',
    componentRef: 'core.webhook.post',
    logger: {
      info: (...args: unknown[]) => console.log('[INFO]', ...args),
      error: (...args: unknown[]) => console.error('[ERROR]', ...args),
    },
    emitProgress: (message: string) => console.log('[PROGRESS]', message),
  };

  test('should send webhook to httpbin.org successfully', async () => {
    const component = componentRegistry.get('core.webhook.post');
    expect(component).toBeDefined();

    const { runComponentWithRunner } = await import('@shipsec/component-sdk');
    const result = await runComponentWithRunner(
      component!.runner,
      component!.execute as any,
      {
        url: 'https://httpbin.org/post',
        payload: {
          test: 'webhook-integration',
          timestamp: new Date().toISOString(),
          data: { value: 42 },
        },
      },
      context,
    ) as any;

    expect(result.status).toBe('sent');
    expect(result.statusCode).toBe(200);
    expect(result.attempts).toBe(1);
    expect(result.responseBody).toBeDefined();
  }, 30000);

  test('should handle 404 errors correctly', async () => {
    const component = componentRegistry.get('core.webhook.post');
    
    const { runComponentWithRunner } = await import('@shipsec/component-sdk');
    const result = await runComponentWithRunner(
      component!.runner,
      component!.execute as any,
      {
        url: 'https://httpbin.org/status/404',
        payload: { test: true },
        retries: 2,
      },
      context,
    ) as any;

    expect(result.status).toBe('failed');
    expect(result.statusCode).toBe(404);
    expect(result.attempts).toBe(2);
  }, 30000);

  test('should send webhook with custom headers', async () => {
    const component = componentRegistry.get('core.webhook.post');
    
    const { runComponentWithRunner } = await import('@shipsec/component-sdk');
    const result = await runComponentWithRunner(
      component!.runner,
      component!.execute as any,
      {
        url: 'https://httpbin.org/post',
        payload: { test: true },
        headers: {
          'X-Custom-Header': 'test-value',
          'Authorization': 'Bearer test-token',
        },
      },
      context,
    ) as any;

    expect(result.status).toBe('sent');
    expect(result.statusCode).toBe(200);
    
    // httpbin echoes back the request, so we can verify headers were sent
    const responseData = JSON.parse(result.responseBody);
    expect(responseData.headers['X-Custom-Header']).toBe('test-value');
    expect(responseData.headers['Authorization']).toBe('Bearer test-token');
  }, 30000);

  test('should support PUT method', async () => {
    const component = componentRegistry.get('core.webhook.post');
    
    const { runComponentWithRunner } = await import('@shipsec/component-sdk');
    const result = await runComponentWithRunner(
      component!.runner,
      component!.execute as any,
      {
        url: 'https://httpbin.org/put',
        method: 'PUT',
        payload: { updated: true },
      },
      context,
    ) as any;

    expect(result.status).toBe('sent');
    expect(result.statusCode).toBe(200);
  }, 30000);

  test('should handle network errors gracefully', async () => {
    const component = componentRegistry.get('core.webhook.post');
    
    const { runComponentWithRunner } = await import('@shipsec/component-sdk');
    const result = await runComponentWithRunner(
      component!.runner,
      component!.execute as any,
      {
        url: 'https://this-domain-definitely-does-not-exist-12345.invalid/webhook',
        payload: { test: true },
        retries: 1,
        timeoutMs: 5000,
      },
      context,
    ) as any;

    expect(result.status).toBe('failed');
    expect(result.error).toBeDefined();
    expect(result.attempts).toBeGreaterThan(1); // Should have retried
  }, 30000);
});
