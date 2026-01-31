import { describe, test, expect, beforeAll } from 'bun:test';
import { spawnSync } from 'node:child_process';

const API_BASE = 'http://127.0.0.1:3211/api/v1';
const HEADERS = {
  'Content-Type': 'application/json',
  'x-internal-token': 'local-internal-token',
};

const runE2E = process.env.RUN_E2E === 'true';
const ZAI_API_KEY = process.env.ZAI_API_KEY;
const hasZaiKey = typeof ZAI_API_KEY === 'string' && ZAI_API_KEY.length > 0;

const servicesAvailableSync = (() => {
  if (!runE2E) return false;
  try {
    const result = spawnSync('curl', [
      '-sf',
      '--max-time',
      '2',
      '-H',
      `x-internal-token: ${HEADERS['x-internal-token']}`,
      `${API_BASE}/health`,
    ]);
    return result.status === 0;
  } catch {
    return false;
  }
})();

const e2eDescribe = runE2E && servicesAvailableSync ? describe : describe.skip;

async function pollRunStatus(runId: string, timeoutMs = 300000): Promise<{ status: string }> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const res = await fetch(`${API_BASE}/workflows/runs/${runId}/status`, { headers: HEADERS });
    const s = await res.json();
    if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(s.status)) return s;
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error(`Workflow run ${runId} timed out after ${timeoutMs}ms`);
}

async function createWorkflow(workflow: any): Promise<string> {
  const res = await fetch(`${API_BASE}/workflows`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(workflow),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create workflow: ${res.status} ${text}`);
  }
  const { id } = await res.json();
  return id;
}

async function runWorkflow(workflowId: string): Promise<string> {
  const res = await fetch(`${API_BASE}/workflows/${workflowId}/run`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ inputs: {} }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to run workflow: ${res.status} ${text}`);
  }
  const { runId } = await res.json();
  return runId;
}

e2eDescribe('OpenCode Agent with MCP (oauth: false fix)', () => {
  beforeAll(() => {
    if (!hasZaiKey) {
      throw new Error('Missing ZAI_API_KEY env var for OpenCode MCP E2E tests.');
    }
    console.log(`[E2E] Services available: ${servicesAvailableSync}`);
    console.log(`[E2E] ZAI API Key ready: ${hasZaiKey}`);
  });

  test(
    'OpenCode agent with MCP gateway configured (oauth: false)',
    async () => {
      console.log('[E2E] Creating workflow with OpenCode + MCP gateway...');

      const workflow = {
        name: 'E2E: OpenCode with MCP Gateway',
        nodes: [
          {
            id: 'start',
            type: 'core.workflow.entrypoint',
            position: { x: 0, y: 0 },
            data: { label: 'Start', config: { params: { runtimeInputs: [] } } },
          },
          {
            id: 'opencode',
            type: 'core.ai.opencode',
            position: { x: 400, y: 0 },
            data: {
              label: 'OpenCode Agent',
              config: {
                params: {
                  systemPrompt:
                    'You are a helpful assistant. Provide a brief response about security investigation.',
                  autoApprove: true,
                },
                inputOverrides: {
                  task: 'Investigate a potential security threat. What steps would you take?',
                  model: {
                    provider: 'zai-coding-plan',
                    modelId: 'glm-4.7',
                    apiKey: ZAI_API_KEY,
                  },
                },
              },
            },
          },
        ],
        edges: [{ id: 'e1', source: 'start', target: 'opencode' }],
      };

      const workflowId = await createWorkflow(workflow);
      console.log(`[E2E] Created workflow: ${workflowId}`);

      const runId = await runWorkflow(workflowId);
      console.log(`[E2E] Started run: ${runId}`);

      const result = await pollRunStatus(runId, 300000);
      console.log(`[E2E] Run completed with status: ${result.status}`);

      expect(result.status).toBe('COMPLETED');

      // Wait for logs to flush
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const traceRes = await fetch(`${API_BASE}/workflows/runs/${runId}/trace`, { headers: HEADERS });
      const trace = await traceRes.json();

      const opencodeCompleted = trace.events.find(
        (e: any) => e.nodeId === 'opencode' && e.type === 'COMPLETED',
      );
      console.log(`[E2E] OpenCode node completed:`, !!opencodeCompleted);

      expect(opencodeCompleted).toBeDefined();

      if (opencodeCompleted) {
        const report = opencodeCompleted.outputSummary?.report;
        console.log(`[E2E] Report received (${report?.length || 0} chars)`);
        expect(report).toBeDefined();
        expect(typeof report).toBe('string');
        expect(report.length).toBeGreaterThan(0);
      }
    },
    300000,
  );
});
