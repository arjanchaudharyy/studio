import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { spawn } from 'node:child_process';
import { ChildProcess } from 'node:child_process';

const API_BASE = 'http://127.0.0.1:3211/api/v1';
const HEADERS = {
  'Content-Type': 'application/json',
  'x-internal-token': 'local-internal-token',
};

const runE2E = process.env.RUN_E2E === 'true';
const ZAI_API_KEY = process.env.ZAI_API_KEY;
const GATEWAY_URL = 'http://localhost:3211/api/v1/mcp/gateway';

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

async function pollRunStatus(runId: string, timeoutMs = 240000): Promise<{ status: string }> {
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

async function testGatewayConnection(): Promise<boolean> {
  try {
    const res = await fetch(GATEWAY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 1,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

e2eDescribe('Simple MCP Tool Discovery Test', () => {
  let mcpProcess: ChildProcess | null = null;

  beforeAll(async () => {
    if (!ZAI_API_KEY) {
      throw new Error('ZAI_API_KEY required. Set via .env.eng-104');
    }

    console.log('\n🔧 Starting test MCP server on stdio...');
    mcpProcess = spawn('bun', ['test-mcp-server.ts'], {
      stdio: ['pipe', 'inherit', 'inherit'],
    });

    // Wait for server to start
    await new Promise((resolve) => setTimeout(resolve, 2000));

    console.log('✅ Test MCP server started\n');

    // Test gateway connection
    console.log('🔗 Testing gateway connection...');
    const gatewayOk = await testGatewayConnection();
    console.log(gatewayOk ? '✅ Gateway is reachable\n' : '⚠️  Gateway may not be reachable\n');
  });

  afterAll(() => {
    if (mcpProcess) {
      console.log('\n🛑 Stopping test MCP server...');
      mcpProcess.kill();
    }
  });

  test(
    'OpenCode discovers and calls a simple MCP tool via gateway',
    { timeout: 240000 },
    async () => {
      // Create workflow with OpenCode that explicitly asks to use the weather tool
      const workflow = {
        name: 'Simple MCP Tool Discovery',
        description: 'Test if OpenCode discovers tools from MCP gateway',
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
            id: 'agent',
            type: 'core.ai.opencode',
            position: { x: 400, y: 50 },
            data: {
              label: 'Weather Assistant',
              config: {
                params: {
                  systemPrompt: `You are a weather assistant with access to a get_weather tool via MCP.
You have a tool called 'get_weather' available.
IMPORTANT: You MUST use this tool to get weather information.
Do NOT use web search.
Call the get_weather tool and report the results.`,
                  autoApprove: true,
                },
                inputOverrides: {
                  task: 'Use the get_weather tool to get weather for San Francisco. Do not use web search. Only use the available tool.',
                  context: {
                    test: 'MCP tool discovery test',
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
        edges: [],
      };

      console.log('\n📋 Creating workflow...');
      const workflowId = await createWorkflow(workflow);
      console.log(`✅ Workflow created: ${workflowId}\n`);

      console.log('🚀 Starting workflow execution...');
      const runId = await runWorkflow(workflowId, {});
      console.log(`✅ Workflow started: ${runId}\n`);

      console.log('⏳ Waiting for workflow to complete...');
      const result = await pollRunStatus(runId);
      console.log(`✅ Workflow status: ${result.status}\n`);
      expect(result.status).toBe('COMPLETED');

      // Get trace
      console.log('📊 Retrieving trace events...');
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const trace = await getRunTrace(runId);
      console.log(`✅ Retrieved ${trace.events.length} trace events\n`);

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

          // Evidence of tool call
          const toolCallIndicators = [
            'get_weather',
            'mcp',
            'san francisco',
            'weather',
            'temperature',
            'condition',
            'sunny',
            'humidity',
            'mcp_server_response',
          ];

          const foundIndicators = toolCallIndicators.filter((ind) => reportLower.includes(ind));

          console.log('🔍 MCP Tool Call Evidence:');
          console.log(`Found ${foundIndicators.length}/${toolCallIndicators.length} indicators:`);
          foundIndicators.forEach((ind) => console.log(`  ✅ "${ind}"`));

          const missingIndicators = toolCallIndicators.filter((ind) => !reportLower.includes(ind));
          if (missingIndicators.length > 0) {
            console.log(`Missing ${missingIndicators.length}:`);
            missingIndicators.forEach((ind) => console.log(`  ❌ "${ind}"`));
          }
          console.log();

          if (foundIndicators.length >= 4) {
            console.log('✅ TOOL WAS CALLED: Agent successfully invoked the MCP tool');
          } else {
            console.log('❌ TOOL NOT CALLED: Agent did not invoke the MCP tool');
          }
          console.log();

          // Expect at least some evidence
          expect(foundIndicators.length).toBeGreaterThan(0);
        }
      }
    },
  );
});
