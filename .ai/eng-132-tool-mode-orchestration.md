# ENG-132: Tool Mode Orchestration Implementation Plan

> **Branch:** `eng-132/tool-mode-orchestration` (from `eng-98/mcp-gateway`)
> **Linear:** https://linear.app/shipsec-ai/issue/ENG-132

---

## Executive Summary

Enable AI agents to discover and call tools that are **explicitly connected** to them in the workflow graph. Tool-mode nodes register in Redis when executed, and agents query the MCP Gateway at runtime to discover available tools based on graph connections.

---

## Current State Analysis (ENG-98)

### Files and Their Roles

| File | Purpose | Status |
|------|---------|--------|
| `backend/src/mcp/tool-registry.service.ts` | Redis-backed storage for tools + encrypted credentials | ✅ Complete |
| `backend/src/mcp/mcp-gateway.service.ts` | MCP Server instances per run, tool registration, execution | ✅ Complete |
| `backend/src/mcp/mcp-gateway.controller.ts` | Streamable HTTP endpoint at `/mcp/gateway` | ✅ Complete |
| `backend/src/mcp/mcp-auth.guard.ts` | Session-scoped auth with runId | ✅ Complete |
| `backend/src/mcp/internal-mcp.controller.ts` | Internal API for worker registration calls | ✅ Complete |
| `worker/src/temporal/activities/mcp.activity.ts` | `registerComponentToolActivity`, `registerLocalMcpActivity`, etc. | ✅ Complete |
| `worker/src/temporal/workflows/index.ts` | Tool mode detection (line 617), calls registration activities | ✅ Complete |
| `worker/src/components/ai/ai-agent.ts` | AI agent with `mcpTools` input port | ⚠️ Needs modification |
| `packages/component-sdk/src/tool-helpers.ts` | `getToolMetadata()`, `getCredentialInputIds()` | ✅ Complete |

### What's Working

1. **Tool Mode Detection** (`workflows/index.ts:617-670`)
   ```typescript
   const isToolMode = nodeMetadata?.mode === 'tool';
   if (isToolMode) {
     if (action.componentId === 'core.mcp.server') {
       // Spin up Docker, register local MCP
     } else {
       // Register component as tool
       await prepareAndRegisterToolActivity({...});
     }
     return { activePorts: ['default'] };
   }
   ```

2. **Tool Registration** (`mcp.activity.ts`)
   - `prepareAndRegisterToolActivity()` - Extracts tool metadata, credentials, calls backend API
   - `registerLocalMcpActivity()` - Registers Docker-based MCP servers
   - `registerRemoteMcpActivity()` - Registers HTTP MCP endpoints

3. **MCP Gateway** (`mcp-gateway.service.ts`)
   - `getServerForRun()` - Creates McpServer instance per runId
   - `registerTools()` - Registers all tools from Redis into McpServer
   - `callComponentTool()` - Signals Temporal workflow to execute tool
   - Tool execution via `executeToolCallSignal` and polling `getToolCallResult`

4. **E2E Test** (`e2e-tests/mcp-tool-mode.test.ts`)
   - Creates workflow with `mode: 'tool'` node
   - Verifies tool registration in trace events

### What's Missing

1. **Agent doesn't use MCP Gateway** - Uses `mcpTools` input port data instead
2. **No graph-based scoping** - All tools for a run are visible to all agents
3. **No `connectedToolNodeIds`** - Compiler doesn't track tool→agent edges

---

## Implementation Plan

### Phase 1: Compiler - Track Tool→Agent Edges

**Goal:** When compiling a workflow, identify which tool-mode nodes connect to each agent node.

#### 1.1 Update Workflow Schema Types

**File:** `packages/shared/src/workflow-schema.ts` (or equivalent)

```typescript
// Add to WorkflowNodeMetadata
export interface WorkflowNodeMetadata {
  mode?: 'normal' | 'tool';
  toolConfig?: {
    boundInputIds: string[];    // Credentials pre-resolved
    exposedInputIds: string[];  // Inputs agent provides
  };
  // NEW: For agent nodes, list of connected tool node IDs
  connectedToolNodeIds?: string[];
}
```

#### 1.2 Update Workflow Compiler

**File:** `backend/src/workflows/compiler/workflow-compiler.ts` (or equivalent)

Add logic to:
1. Identify agent nodes (components with `id.startsWith('core.ai.')` or specific IDs)
2. Find edges where `targetHandle === 'tools'`
3. Collect source node IDs
4. Store in `nodes[agentNodeId].connectedToolNodeIds`

```typescript
function compileWorkflow(definition: WorkflowDefinition): CompiledWorkflow {
  // ... existing compilation ...
  
  // NEW: Collect tool connections for agent nodes
  for (const node of definition.nodes) {
    if (isAgentNode(node)) {
      const toolEdges = definition.edges.filter(
        e => e.target === node.id && e.targetHandle === 'tools'
      );
      const connectedToolNodeIds = toolEdges.map(e => e.source);
      compiledNodes[node.id].connectedToolNodeIds = connectedToolNodeIds;
    }
  }
}
```

---

### Phase 2: Runtime - Pass Tool NodeIds to Agent

**Goal:** When agent node executes, it knows which tool nodes are connected.

#### 2.1 Update Workflow Orchestrator

**File:** `worker/src/temporal/workflows/index.ts`

When executing an agent component, include `connectedToolNodeIds` in the activity input or context.

```typescript
// Around line 594
const nodeMetadata = input.definition.nodes?.[action.ref];

// For agent nodes, include connected tool info
const activityInput: RunComponentActivityInput = {
  // ... existing fields ...
  metadata: {
    streamId,
    // NEW: Pass connected tool node IDs
    connectedToolNodeIds: nodeMetadata?.connectedToolNodeIds,
  },
};
```

#### 2.2 Update RunComponentActivityInput Type

**File:** `worker/src/temporal/types.ts`

```typescript
export interface RunComponentActivityInput {
  // ... existing fields ...
  metadata?: {
    streamId?: string;
    // NEW
    connectedToolNodeIds?: string[];
  };
}
```

---

### Phase 3: Agent Component - Query Gateway

**Goal:** Agent queries MCP Gateway for tools instead of using `mcpTools` input.

#### 3.1 Add Gateway Client to Agent

**File:** `worker/src/components/ai/ai-agent.ts`

Create an MCP Gateway client that:
1. Gets session token from backend (new internal API)
2. Connects to gateway with nodeIds filter
3. Discovers tools via MCP `tools/list`
4. Calls tools via MCP protocol

```typescript
class McpGatewayClient {
  private transport: StreamableHTTPClientTransport;
  private client: Client;
  
  constructor(
    private readonly gatewayUrl: string,
    private readonly sessionToken: string,
  ) {}
  
  async connect(): Promise<void> {
    this.transport = new StreamableHTTPClientTransport(
      new URL(this.gatewayUrl),
      { headers: { 'Authorization': `Bearer ${this.sessionToken}` } }
    );
    this.client = new Client({ name: 'shipsec-agent', version: '1.0.0' });
    await this.client.connect(this.transport);
  }
  
  async listTools(): Promise<Tool[]> {
    const response = await this.client.listTools();
    return response.tools;
  }
  
  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const response = await this.client.callTool({ name, arguments: args });
    return response;
  }
}
```

#### 3.2 Update Agent Execute Function

**File:** `worker/src/components/ai/ai-agent.ts`

```typescript
async execute({ inputs, params }, context) {
  const { mcpTools, ...otherInputs } = inputs;
  
  // NEW: Check if we should use gateway instead of input port
  const connectedToolNodeIds = context.metadata?.connectedToolNodeIds;
  
  let tools: RegisteredMcpTool[] = [];
  
  if (connectedToolNodeIds && connectedToolNodeIds.length > 0) {
    // Use MCP Gateway for tool discovery
    const gatewayClient = await this.createGatewayClient(context, connectedToolNodeIds);
    const gatewayTools = await gatewayClient.listTools();
    tools = this.convertGatewayToolsToRegisteredTools(gatewayTools, gatewayClient);
  } else if (mcpTools) {
    // Fallback: Use mcpTools input port (backward compatibility)
    tools = registerMcpTools({ tools: mcpTools, ... });
  }
  
  // ... rest of agent logic ...
}
```

#### 3.3 Add Gateway Session API

**File:** `backend/src/mcp/internal-mcp.controller.ts`

New endpoint for worker to get a session token:

```typescript
@Post('session')
async createSession(@Body() input: CreateMcpSessionDto): Promise<{ sessionToken: string }> {
  const token = await this.mcpAuthService.createSessionToken({
    runId: input.runId,
    organizationId: input.organizationId,
    allowedNodeIds: input.connectedToolNodeIds,
  });
  return { sessionToken: token };
}
```

---

### Phase 4: Gateway - Filter by NodeIds

**Goal:** Gateway only returns tools for specified node IDs.

#### 4.1 Update Tool Registry Query

**File:** `backend/src/mcp/tool-registry.service.ts`

```typescript
async getToolsForRun(runId: string, nodeIds?: string[]): Promise<RegisteredTool[]> {
  if (!this.redis) return [];
  
  const key = this.getRegistryKey(runId);
  const toolsHash = await this.redis.hgetall(key);
  
  let tools = Object.values(toolsHash).map(json => JSON.parse(json) as RegisteredTool);
  
  // NEW: Filter by nodeIds if specified
  if (nodeIds && nodeIds.length > 0) {
    tools = tools.filter(t => nodeIds.includes(t.nodeId));
  }
  
  return tools;
}
```

#### 4.2 Update Gateway Service

**File:** `backend/src/mcp/mcp-gateway.service.ts`

```typescript
async getServerForRun(
  runId: string,
  organizationId?: string | null,
  allowedTools?: string[],
  allowedNodeIds?: string[],  // NEW
): Promise<McpServer> {
  await this.validateRunAccess(runId, organizationId);
  
  // ... existing server creation ...
  
  await this.registerTools(server, runId, allowedTools, allowedNodeIds);
  // ...
}

private async registerTools(
  server: McpServer,
  runId: string,
  allowedTools?: string[],
  allowedNodeIds?: string[],  // NEW
) {
  const allRegistered = await this.toolRegistry.getToolsForRun(runId, allowedNodeIds);
  // ... rest of registration ...
}
```

#### 4.3 Update Session Token

**File:** `backend/src/mcp/mcp-auth.service.ts`

Include `allowedNodeIds` in session token payload:

```typescript
interface McpSessionPayload {
  runId: string;
  organizationId?: string | null;
  allowedNodeIds?: string[];  // NEW
}
```

---

### Phase 5: E2E Test

**Goal:** Full integration test with tool-mode nodes connected to agent.

#### 5.1 Create Test

**File:** `e2e-tests/agent-tool-mode.test.ts`

```typescript
test('agent discovers and calls tools via graph connection', async () => {
  const workflow = {
    name: 'Agent Tool Mode Test',
    nodes: [
      { id: 'start', type: 'core.workflow.entrypoint', ... },
      { 
        id: 'abuseipdb', 
        type: 'security.abuseipdb',
        mode: 'tool',
        data: { config: { params: { /* api key from secret */ } } }
      },
      {
        id: 'agent',
        type: 'core.ai.agent',
        data: { config: { params: { systemPrompt: 'Check the IP 8.8.8.8' } } }
      },
    ],
    edges: [
      { source: 'start', target: 'abuseipdb' },
      { source: 'abuseipdb', sourceHandle: 'tools', target: 'agent', targetHandle: 'tools' },
    ],
  };
  
  // Run workflow, verify:
  // 1. abuseipdb registers in Redis
  // 2. agent discovers abuseipdb via gateway
  // 3. agent calls abuseipdb, gets result
});
```

---

## File Change Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `packages/shared/src/workflow-schema.ts` | Modify | Add `connectedToolNodeIds` to node metadata |
| `backend/src/workflows/compiler/*.ts` | Modify | Track tool→agent edges during compilation |
| `worker/src/temporal/types.ts` | Modify | Add `connectedToolNodeIds` to activity metadata |
| `worker/src/temporal/workflows/index.ts` | Modify | Pass `connectedToolNodeIds` to agent execution |
| `worker/src/components/ai/ai-agent.ts` | Modify | Add MCP Gateway client, query tools at runtime |
| `backend/src/mcp/tool-registry.service.ts` | Modify | Add `nodeIds` filter to `getToolsForRun()` |
| `backend/src/mcp/mcp-gateway.service.ts` | Modify | Pass `allowedNodeIds` to tool registration |
| `backend/src/mcp/mcp-auth.service.ts` | Modify | Include `allowedNodeIds` in session token |
| `backend/src/mcp/internal-mcp.controller.ts` | Modify | Add session creation endpoint |
| `e2e-tests/agent-tool-mode.test.ts` | New | E2E test for agent+tool workflow |

---

## Testing Strategy

### Unit Tests
- [ ] Compiler: Verify `connectedToolNodeIds` is populated
- [ ] Tool Registry: Verify `nodeIds` filter works
- [ ] Gateway: Verify tools are scoped by nodeIds

### Integration Tests
- [ ] Backend: Session token includes nodeIds
- [ ] Gateway: Only connected tools are discoverable

### E2E Tests
- [ ] Single agent with single tool
- [ ] Single agent with multiple tools
- [ ] Multiple agents with different tools (scoping)
- [ ] Tool-mode MCP server (Docker)

---

## Rollout Plan

1. **Phase 1-2:** Compiler + Runtime changes (no breaking changes)
2. **Phase 3:** Agent component update (backward compatible via fallback)
3. **Phase 4:** Gateway filtering (transparent)
4. **Phase 5:** E2E tests + documentation

---

## Open Questions

1. **Circular dependency?** Agent component imports MCP SDK client. Need to ensure bundle sizes are acceptable.
2. **Gateway URL discovery?** Agent needs to know gateway URL. Options:
   - Environment variable (`SHIPSEC_MCP_GATEWAY_URL`)
   - Passed via execution context
   - Hardcoded to `/mcp/gateway`
3. **Backward compatibility?** Keep `mcpTools` input port working for existing workflows.
