import { describe, test, expect, beforeAll } from 'bun:test';
import { spawnSync } from 'node:child_process';

const API_BASE = 'http://127.0.0.1:3211/api/v1';
const HEADERS = {
  'Content-Type': 'application/json',
  'x-internal-token': 'local-internal-token',
};

const runE2E = process.env.RUN_E2E === 'true';
const ZAI_API_KEY = process.env.ZAI_API_KEY;

const servicesAvailableSync = (() => {
  if (!runE2E) return false;
  try {
    const result = spawnSync('curl', [
      '-sf',
      '--max-time',
      '1',
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
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`Workflow run ${runId} timed out`);
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

async function runWorkflow(workflowId: string, inputs: Record<string, unknown> = {}): Promise<string> {
  const res = await fetch(`${API_BASE}/workflows/${workflowId}/run`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ inputs }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to run workflow: ${res.status} ${text}`);
  }
  const { runId } = await res.json();
  return runId;
}

async function getRunTrace(runId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/workflows/runs/${runId}/trace`, { headers: HEADERS });
  return await res.json();
}

e2eDescribe('Simple Tool Call Test', () => {
  beforeAll(() => {
    if (!ZAI_API_KEY) {
      throw new Error('ZAI_API_KEY required. Set via .env.eng-104');
    }
  });

  test(
    'OpenCode agent calls a simple tool',
    { timeout: 120000 },
    async () => {
      // Create a simple workflow with:
      // 1. Entry point
      // 2. A simple logic script tool that outputs JSON
      // 3. OpenCode agent with explicit instruction to call the tool
      const workflow = {
        name: 'Simple Tool Call Test',
        description: 'Test that OpenCode actually calls available tools',
        nodes: [
          {
            id: 'start',
            type: 'core.workflow.entrypoint',
            position: { x: 50, y: 50 },
            data: {
              label: 'Start',
              config: {
                params: {},
                inputOverrides: {},
              },
            },
          },
          {
            id: 'simple_tool',
            type: 'core.logic.script',
            position: { x: 350, y: 50 },
            data: {
              label: 'Simple Tool',
              config: {
                mode: 'tool',
                params: {
                  code: `
const now = new Date().toISOString();
const result = {
  status: "success",
  message: "Simple tool was called successfully!",
  timestamp: now,
  data: {
    toolId: "simple_tool",
    testValue: 42,
    greeting: "Hello from the tool!"
  }
};
console.log(JSON.stringify(result));
return result;
`,
                  language: 'javascript',
                },
                inputOverrides: {},
              },
            },
          },
          {
            id: 'agent',
            type: 'core.ai.opencode',
            position: { x: 800, y: 50 },
            data: {
              label: 'OpenCode Agent',
              config: {
                params: {
                  systemPrompt: `You are a test agent. You MUST call the available tool named 'simple_tool'. 
Do NOT skip this step. 
Examine the tool's output carefully.
Then provide a summary of what the tool returned.`,
                  autoApprove: true,
                },
                inputOverrides: {
                  task: 'Call the simple_tool that is available to you. Do not use web search. Only call the provided tool and report what it returns.',
                  context: {
                    testInfo: 'This is a test to verify tool invocation works',
                  },
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
        edges: [
          {
            id: 'e1',
            source: 'start',
            target: 'simple_tool',
            sourceHandle: '__default__',
            targetHandle: '__default__',
          },
          {
            id: 'e2',
            source: 'start',
            target: 'agent',
            sourceHandle: '__default__',
            targetHandle: '__default__',
          },
          // KEY: Connect tool to agent with tools handle
          {
            id: 'tool_connection',
            source: 'simple_tool',
            target: 'agent',
            sourceHandle: '__default__',
            targetHandle: 'tools',
          },
        ],
      };

      const workflowId = await createWorkflow(workflow);
      console.log(`Created workflow: ${workflowId}`);

      const runId = await runWorkflow(workflowId, {});
      console.log(`Started workflow run: ${runId}`);

      const result = await pollRunStatus(runId);
      console.log(`Workflow status: ${result.status}`);
      expect(result.status).toBe('COMPLETED');

      // Get trace to examine what happened
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const trace = await getRunTrace(runId);
      console.log(`Trace events: ${trace.events.length}`);

      // Find the agent completion event
      const agentCompleted = trace.events.find(
        (e: any) => e.nodeId === 'agent' && e.type === 'COMPLETED',
      );
      expect(agentCompleted).toBeDefined();

      if (agentCompleted) {
        const report = agentCompleted.outputSummary?.report as string | undefined;
        console.log('Agent report:');
        console.log(report);

        expect(report).toBeDefined();
        if (report) {
          // Check if the report mentions the tool output or success
          const reportLower = report.toLowerCase();
          const hasToolMention =
            reportLower.includes('simple_tool') ||
            reportLower.includes('tool was called') ||
            reportLower.includes('successfully') ||
            reportLower.includes('message') ||
            reportLower.includes('42');

          console.log(
            `\nTool invocation check: ${hasToolMention ? '✅ FOUND' : '❌ NOT FOUND'}`,
          );
          console.log('Looking for evidence of tool call in report...');

          if (!hasToolMention) {
            console.log('\n⚠️  WARNING: Report does not mention tool output');
            console.log('This suggests the agent may have used web search instead of calling the tool');
          }

          expect(hasToolMention).toBe(true);
        }
      }
    },
  );
});
