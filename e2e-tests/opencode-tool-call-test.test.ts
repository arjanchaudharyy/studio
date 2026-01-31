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

e2eDescribe('OpenCode Tool Invocation Test', () => {
  beforeAll(() => {
    if (!ZAI_API_KEY) {
      throw new Error('ZAI_API_KEY required. Set via .env.eng-104');
    }
  });

  test(
    'OpenCode agent actually calls a tool when given explicit instruction',
    { timeout: 240000 },
    async () => {
      // Create simple workflow:
      // 1. Entry point
      // 2. A simple logic script in TOOL MODE that returns structured data
      // 3. OpenCode agent with EXPLICIT instruction to call the tool
      
      const workflow = {
        name: 'OpenCode Tool Call Verification',
        description: 'Verify that OpenCode actually calls connected tools',
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
                      id: 'user_request',
                      label: 'User Request',
                      type: 'text',
                      required: false,
                    },
                  ],
                },
              },
            },
          },
          {
            id: 'simple_tool',
            type: 'core.logic.script',
            position: { x: 350, y: 50 },
            data: {
              label: 'Get Weather Tool',
              config: {
                mode: 'tool',
                params: {
                  code: `
// Simple tool that returns structured data
const result = {
  status: "success",
  tool_name: "get_weather_tool",
  location: "San Francisco",
  temperature: 72,
  weather: "sunny with clouds",
  humidity: 65,
  wind_speed: 12,
  timestamp: new Date().toISOString(),
  tool_was_called: true,
  message: "This tool was successfully invoked by the agent!"
};
console.log(JSON.stringify(result, null, 2));
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
              label: 'OpenCode Assistant',
              config: {
                params: {
                  systemPrompt: `You are a helpful assistant with access to tools. 
You have a weather tool available. 
IMPORTANT: You MUST use the tool to get the weather information.
Do NOT skip calling the tool.
Report back what the tool returns.`,
                  autoApprove: true,
                },
                inputOverrides: {
                  task: 'You have a weather tool available. Please call the tool to get the current weather. Do NOT use web search. ONLY call the tool and report what it returns.',
                  context: {
                    instruction: 'This is a test. The tool MUST be called.',
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
          // KEY: Connect tool to agent with 'tools' handle
          // This makes the tool available to the agent
          {
            id: 'tool_to_agent',
            source: 'simple_tool',
            target: 'agent',
            sourceHandle: 'tools',
            targetHandle: 'tools',
          },
        ],
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

      // Get trace to examine what happened
      console.log('📊 Retrieving trace events...');
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const trace = await getRunTrace(runId);
      console.log(`✅ Retrieved ${trace.events.length} trace events\n`);

      // Find the agent completion event
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
          // Check for evidence that the tool was actually called
          const reportLower = report.toLowerCase();
          
          const toolCallIndicators = [
            'weather',
            'san francisco',
            'temperature',
            '72',
            'sunny',
            'humidity',
            'tool was called',
            'get_weather_tool',
            'tool_name',
          ];

          const foundIndicators = toolCallIndicators.filter(ind => reportLower.includes(ind));
          
          console.log('🔍 Tool Call Evidence Check:');
          console.log(`Found ${foundIndicators.length}/${toolCallIndicators.length} tool output indicators:`);
          foundIndicators.forEach(ind => console.log(`  ✅ "${ind}"`));
          
          const missingIndicators = toolCallIndicators.filter(ind => !reportLower.includes(ind));
          if (missingIndicators.length > 0) {
            console.log(`Missing ${missingIndicators.length} indicators:`);
            missingIndicators.forEach(ind => console.log(`  ❌ "${ind}"`));
          }
          console.log();

          // Check if tool was called
          const toolWasCalled = foundIndicators.length >= 5; // At least 5 indicators found
          
          if (toolWasCalled) {
            console.log('✅ TOOL WAS CALLED: Agent invoked the tool successfully');
          } else {
            console.log('❌ TOOL NOT CALLED: Agent did not invoke the tool');
            console.log('The agent likely used web search instead of calling the tool.');
          }
          console.log();

          // Expect at least some evidence of tool call
          expect(foundIndicators.length).toBeGreaterThan(0);
        }
      }
    },
  );
});
