import { describe, it, expect, beforeAll, afterEach, vi } from 'bun:test';
import * as sdk from '@shipsec/component-sdk';
import { componentRegistry } from '../../index';
import { definition } from '../abusedb';

describe('abusedb component', () => {
  beforeAll(async () => {
    // Ensure registry is populated
    await import('../../index');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should be registered with correct metadata', () => {
    const component = componentRegistry.get('security.abuseipdb.check');
    expect(component).toBeDefined();
    expect(component!.label).toBe('AbuseIPDB Check');
    expect(component!.category).toBe('security');
  });

  it('should execute successfully with valid input', async () => {
     const component = componentRegistry.get('security.abuseipdb.check');
     if (!component) throw new Error('Component not registered');

     const context = sdk.createExecutionContext({
        runId: 'test-run',
        componentRef: 'abusedb-test',
     });

     const params = {
         ipAddress: '127.0.0.1',
         apiKey: 'test-key',
         maxAgeInDays: 90,
         verbose: false
     };

     const mockResponse = {
         data: {
             ipAddress: '127.0.0.1',
             isPublic: true,
             ipVersion: 4,
             isWhitelisted: false,
             abuseConfidenceScore: 100,
             countryCode: 'US',
             usageType: 'Data Center',
             isp: 'Test ISP',
             domain: 'example.com',
             totalReports: 10,
             numDistinctUsers: 5,
             lastReportedAt: '2023-01-01T00:00:00Z'
         }
     };

     const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify(mockResponse), {
         status: 200,
         headers: { 'Content-Type': 'application/json' }
     }));

     const result = await component.execute(params, context);

     expect(fetchSpy).toHaveBeenCalled();
     const callArgs = fetchSpy.mock.calls[0];
     expect(callArgs[0]).toContain('https://api.abuseipdb.com/api/v2/check');
     expect(callArgs[0]).toContain('ipAddress=127.0.0.1');
     
     // Type assertion or check specific fields
     const output = result as any;
     expect(output.ipAddress).toBe('127.0.0.1');
     expect(output.abuseConfidenceScore).toBe(100);
     expect(output.isp).toBe('Test ISP');
     expect(output.full_report).toEqual(mockResponse);
  });

  it('should handle 404', async () => {
      const component = componentRegistry.get('security.abuseipdb.check');
      if (!component) throw new Error('Component not registered');
 
      const context = sdk.createExecutionContext({
         runId: 'test-run',
         componentRef: 'abusedb-test',
      });
 
      const params = {
          ipAddress: '0.0.0.0',
          apiKey: 'test-key',
          maxAgeInDays: 90,
          verbose: false
      };
 
      vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, {
          status: 404,
      }));
 
      const result = await component.execute(params, context);
      const output = result as any;
      expect(output.abuseConfidenceScore).toBe(0);
      expect(output.full_report.error).toBe('Not Found');
  });

  it('should throw error on failure', async () => {
    const component = componentRegistry.get('security.abuseipdb.check');
    if (!component) throw new Error('Component not registered');

    const context = sdk.createExecutionContext({
       runId: 'test-run',
       componentRef: 'abusedb-test',
    });

    const params = {
        ipAddress: '1.1.1.1',
        apiKey: 'test-key',
        maxAgeInDays: 90,
        verbose: false
    };

    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('Unauthorized', {
        status: 401,
        statusText: 'Unauthorized'
    }));

    await expect(component.execute(params, context)).rejects.toThrow();
  });
});
