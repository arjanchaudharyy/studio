/**
 * Optional integration test for AbuseIPDB component.
 * Requires a valid AbuseIPDB API key.
 * Enable by setting RUN_ABUSEDB_TESTS=1 and providing ABUSEIPDB_API_KEY.
 */
import { describe, expect, test, beforeEach } from 'bun:test';
import { componentRegistry, createExecutionContext, type ExecutionContext } from '@shipsec/component-sdk';
import type { definition } from '../abusedb';
import '../../index'; // Ensure registry is populated

const shouldRunIntegration =
  process.env.RUN_ABUSEDB_TESTS === '1' && !!process.env.ABUSEIPDB_API_KEY;

(shouldRunIntegration ? describe : describe.skip)('AbuseIPDB Integration', () => {
    let context: ExecutionContext;

    beforeEach(async () => {
        context = createExecutionContext({
            runId: 'test-run',
            componentRef: 'abusedb-integration-test',
        });
    });

    test('checks a known IP address', async () => {
        const component = componentRegistry.get('security.abuseipdb.check');
        expect(component).toBeDefined();
        
        // 127.0.0.1 is usually reserved/private so result might be specific, 
        // but 1.1.1.1 is Cloudflare and should exist.
        const ipToCheck = '1.1.1.1'; 
        
        const params = {
            ipAddress: ipToCheck,
            apiKey: process.env.ABUSEIPDB_API_KEY!,
            maxAgeInDays: 90,
            verbose: true
        };

        const result = await component!.execute(params, context);
        const output = result as any;

        expect(output.ipAddress).toBe(ipToCheck);
        expect(typeof output.abuseConfidenceScore).toBe('number');
        expect(output.full_report).toBeDefined();
    });
});
