/**
 * Optional integration test for AbuseIPDB component.
 * Requires a valid AbuseIPDB API key.
 * Enable by setting RUN_ABUSEDB_TESTS=1 and providing ABUSEIPDB_API_KEY.
 */
import { describe, expect, test, beforeEach } from 'bun:test';
import { componentRegistry, createExecutionContext, type ExecutionContext } from '@shipsec/component-sdk';
import '../../index'; // Ensure registry is populated

interface AbuseIPDBOutput {
  ipAddress: string;
  isPublic?: boolean;
  ipVersion?: number;
  isWhitelisted?: boolean;
  abuseConfidenceScore: number;
  countryCode?: string;
  usageType?: string;
  isp?: string;
  domain?: string;
  hostnames?: string[];
  totalReports?: number;
  numDistinctUsers?: number;
  lastReportedAt?: string;
  reports?: Record<string, unknown>[];
  full_report: Record<string, unknown>;
}

const shouldRunIntegration =
  process.env.RUN_ABUSEDB_TESTS === '1' && !!process.env.ABUSEIPDB_API_KEY;

(shouldRunIntegration ? describe : describe.skip)('AbuseIPDB Integration', () => {
    let context: ExecutionContext;

    beforeEach(async () => {
        context = createExecutionContext({
            runId: 'test-run',
            componentRef: 'abuseipdb-integration-test',
        });
    });

    test('checks a known IP address', async () => {
        const component = componentRegistry.get('security.abuseipdb.check');
        expect(component).toBeDefined();
        
        // 1.1.1.1 is Cloudflare DNS and should exist in AbuseIPDB
        const ipToCheck = '1.1.1.1'; 
        
        const params = {
            ipAddress: ipToCheck,
            apiKey: process.env.ABUSEIPDB_API_KEY!,
            maxAgeInDays: 90,
            verbose: true
        };

        const result = await component!.execute(params, context) as AbuseIPDBOutput;

        expect(result.ipAddress).toBe(ipToCheck);
        expect(typeof result.abuseConfidenceScore).toBe('number');
        expect(result.full_report).toBeDefined();
    });

    test('checks a known malicious IP address', async () => {
        const component = componentRegistry.get('security.abuseipdb.check');
        expect(component).toBeDefined();
        
        // Using Google DNS as a safe, known IP
        const ipToCheck = '8.8.8.8'; 
        
        const params = {
            ipAddress: ipToCheck,
            apiKey: process.env.ABUSEIPDB_API_KEY!,
            maxAgeInDays: 90,
            verbose: false
        };

        const result = await component!.execute(params, context) as AbuseIPDBOutput;

        expect(result.ipAddress).toBe(ipToCheck);
        expect(typeof result.abuseConfidenceScore).toBe('number');
        expect(result.abuseConfidenceScore).toBeGreaterThanOrEqual(0);
        expect(result.abuseConfidenceScore).toBeLessThanOrEqual(100);
    });
});
