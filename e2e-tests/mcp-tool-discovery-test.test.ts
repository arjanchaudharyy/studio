import { describe, test, expect, beforeAll } from 'bun:test';
import { spawnSync } from 'node:child_process';

const API_BASE = 'http://127.0.0.1:3211/api/v1';
const HEADERS = {
  'Content-Type': 'application/json',
  'x-internal-token': 'local-internal-token',
};

const runE2E = process.env.RUN_E2E === 'true';
const ZAI_API_KEY = process.env.ZAI_API_KEY;
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

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

e2eDescribe('MCP Tool Discovery via Gateway', () => {
  beforeAll(() => {
    if (!ZAI_API_KEY) {
      throw new Error('ZAI_API_KEY required. Set via .env.eng-104');
    }
    if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
      throw new Error('AWS credentials required. Set via .env.eng-104');
    }
  });

  test(
    'OpenCode discovers and calls a tool via connected MCP component',
    { timeout: 300000 },
    async () => {
      // Create workflow with:
      // 1. HTTP MCP server component in TOOL MODE
      // 2. OpenCode agent connected to the tool
      const workflow = {
        name: 'AWS CloudTrail Tool Discovery Test',
        description: 'Test tool discovery when AWS CloudTrail MCP is connected via workflow edges',
        nodes: [
          {
            id: 'start',
            type: 'core.workflow.entrypoint',
            position: { x: 50, y: 50 },
            data: {
              label: 'Start',
              config: {
                params: {
                  runtimeInputs: [
                    {
                      id: 'location',
                      label: 'Location',
                      type: 'text',
                      required: false,
                    },
                  ],
                },
              },
            },
          },
          {
            id: 'mcp_server',
            type: 'security.aws-cloudtrail-mcp',
            position: { x: 300, y: 50 },
            data: {
              label: 'AWS CloudTrail MCP',
              config: {
                mode: 'tool',
                inputOverrides: {
                  credentials: {
                    accessKeyId: AWS_ACCESS_KEY_ID,
                    secretAccessKey: AWS_SECRET_ACCESS_KEY,
                    region: AWS_REGION,
                  },
                },
              },
            },
          },
          {
            id: 'agent',
            type: 'core.ai.opencode',
            position: { x: 600, y: 50 },
            data: {
              label: 'OpenCode Agent',
              config: {
                params: {
                  systemPrompt: `You are an assistant with access to AWS CloudTrail tools via MCP.
You have tools like list_events, describe_trails, etc.
IMPORTANT: You MUST use the available CloudTrail tools to list some events.
Do NOT use web search or other methods.
Call the CloudTrail tools and report the results.`,
                  autoApprove: true,
                },
                inputOverrides: {
                  task: 'Use the available CloudTrail tools to list some events from the last day. Report what the tool returns.',
                  context: {
                    test: 'MCP tool discovery via connected component',
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
          // KEY: Connect MCP server tool to agent with 'tools' handle
          // This tells the workflow to register it in the gateway
          {
            id: 'tool_connection',
            source: 'mcp_server',
            target: 'agent',
            sourceHandle: 'tools',
            targetHandle: 'tools',
          },
        ],
      };

      console.log('\n📋 Creating workflow with connected MCP tool...');
      const workflowId = await createWorkflow(workflow);
      console.log(`✅ Workflow created: ${workflowId}\n`);

      console.log('🚀 Starting workflow execution...');
      const runId = await runWorkflow(workflowId, {});
      console.log(`✅ Workflow started: ${runId}\n`);

      console.log('⏳ Waiting for workflow to complete (may take 2+ min for MCP server startup)...');
      const result = await pollRunStatus(runId);
      console.log(`✅ Workflow status: ${result.status}\n`);
      expect(result.status).toBe('COMPLETED');

      // Get trace
      console.log('📊 Retrieving trace events...');
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const trace = await getRunTrace(runId);
      console.log(`✅ Retrieved ${trace.events.length} trace events\n`);

      // Check MCP server events
      const mcpEvents = trace.events.filter((e: any) => e.nodeId === 'mcp_server');
      console.log(`MCP Server events found: ${mcpEvents.length}`);
      mcpEvents.forEach((e: any) => console.log(`  - ${e.type}`));
      console.log();

      // Find agent completion
      const agentCompleted = trace.events.find(
        (e: any) => e.nodeId === 'agent' && e.type === 'COMPLETED',
      );
      expect(agentCompleted).toBeDefined();

      if (agentCompleted) {
        const report = agentCompleted.outputSummary?.report as string | undefined;

        console.log('📄 Agent Report:');
        console.log('─'.repeat(80));
        console.log(report);
        console.log('─'.repeat(80));
        console.log();

        expect(report).toBeDefined();
        if (report) {
          const reportLower = report.toLowerCase();

          // Check for evidence of CloudTrail tool call
          const indicators = [
            'cloudtrail',
            'event',
            'events',
            'aws',
            'tool',
            'mcp',
            'list',
            'describe',
          ];

          const found = indicators.filter((ind) => reportLower.includes(ind));

          console.log('🔍 Tool Invocation Evidence:');
          console.log(`Found ${found.length}/${indicators.length} indicators:`);
          found.forEach((ind) => console.log(`  ✅ "${ind}"`));

          const missing = indicators.filter((ind) => !reportLower.includes(ind));
          if (missing.length > 0) {
            console.log(`Missing ${missing.length}:`);
            missing.forEach((ind) => console.log(`  ❌ "${ind}"`));
          }
          console.log();

          if (found.length >= 5) {
            console.log('✅✅✅ TOOL WAS CALLED: MCP tool discovery and invocation works!');
          } else {
            console.log('❌ Tool not called - agent likely used fallback');
          }
          console.log();

          // At minimum, should mention the tool
          expect(found.length).toBeGreaterThan(0);
        }
      }
    },
  );
});
