# ENG-132: Tool Mode Orchestration Implementation Plan (ULTRAWORK)

> **Branch:** `eng-132/tool-mode-orchestration` (from `eng-98/mcp-gateway`)
> **Linear:** https://linear.app/shipsec-ai/issue/ENG-132

---

## Executive Summary

Enable AI agents to discover and call tools that are **explicitly connected** to them in the workflow graph. Tool-mode nodes register in Redis when executed, and agents query the MCP Gateway at runtime to discover available tools based on graph connections.

---

## Mandatory Commit & Verification Rules

- **DCO Sign-off**: Every commit MUST use `git commit -s`.
- **Phase Completion**: Commit after every phase. No "batching" phases.
- **Proof of Work**: Run `lsp_diagnostics` and relevant tests before committing.
- **No Mocking**: Deliver 100% functional code at each step.

---

## Implementation Plan

### Phase 1: DSL Schema and Workflow Types

**Goal:** Add the data structures to support graph-based tool binding.

1. **Update `WorkflowNodeMetadata`** in `worker/src/temporal/types.ts`:
   - Add `connectedToolNodeIds?: string[]` to track which tool nodes are bound to an agent.
2. **Update Agent Component Definition** in `worker/src/components/ai/ai-agent.ts`:
   - Add a `tools` input port configured as a multi-connection input.
3. **Verify**: Run `bun run typecheck` in `worker`.
4. **Commit**: `feat(dsl): add connectedToolNodeIds metadata and agent tools port` (Signed-off).

---

### Phase 2: Workflow Compiler

**Goal:** Automatically populate `connectedToolNodeIds` based on graph edges.

1. **Locate Compiler**: Typically in `backend/src/workflows/compiler/`.
2. **Modify Compilation Logic**:
   - Iterate through edges targeting an agent node's `tools` port.
   - Collect the `source` nodeId for each edge.
   - Store this array in the node's metadata as `connectedToolNodeIds`.
3. **Handle Tool Mode Validation**: Ensure nodes connected to the `tools` port are actually in `mode: 'tool'`.
4. **Verification**: Add a unit test in the compiler suite that verifies the mapping from edges to metadata.
5. **Commit**: `feat(compiler): track tool->agent edges and populate metadata` (Signed-off).

---

### Phase 3: Temporal Orchestrator

**Goal:** Pass `connectedToolNodeIds` to the agent component during execution.

1. **Update `RunComponentActivityInput`** in `worker/src/temporal/types.ts`:
   - Add `connectedToolNodeIds` to the `metadata` field.
2. **Update `shipsecWorkflowRun`** in `worker/src/temporal/workflows/index.ts`:
   - Extract `connectedToolNodeIds` from the node metadata and include it in the `activityInput`.
3. **Verification**: Run `lsp_diagnostics` on the worker package.
4. **Commit**: `feat(temporal): pass connectedToolNodeIds to agent execution context` (Signed-off).

---

### Phase 4: Backend MCP Gateway Scoping

**Goal:** Enable tool filtering by `nodeIds` in the registry and gateway.

1. **Update `ToolRegistryService`** (`backend/src/mcp/tool-registry.service.ts`):
   - Modify `getToolsForRun(runId, nodeIds?: string[])` to filter Redis results.
2. **Update `McpGatewayService`** (`backend/src/mcp/mcp-gateway.service.ts`):
   - Update `getServerForRun` and `registerTools` to accept `allowedNodeIds`.
3. **Update Auth Guard** (`backend/src/mcp/mcp-auth.guard.ts`):
   - Include `allowedNodeIds` in the session context.
4. **Internal Session API**: Add endpoint in `internal-mcp.controller.ts` for the worker to request a scoped session token.
5. **Commit**: `feat(gateway): implement nodeId-based tool scoping and session API` (Signed-off).

---

### Phase 5: Agent MCP Integration

**Goal:** Update agent component to discover tools via MCP Gateway.

1. **Implement `McpGatewayClient`** in `worker/src/components/ai/ai-agent.ts`:
   - Use `StreamableHTTPClientTransport` to connect to `/api/v1/mcp/gateway`.
   - Implement `listTools` and tool execution proxying.
2. **Update Agent `execute`**:
   - Check if `context.metadata.connectedToolNodeIds` is present.
   - If yes, query Gateway for tools.
   - Otherwise, fallback to `mcpTools` input port (legacy support).
3. **Commit**: `feat(agent): implement gateway-based tool discovery and execution` (Signed-off).

---

### Phase 6: E2E Verification

**Goal:** Final proof of work.

1. **Create `e2e-tests/agent-tool-mode.test.ts`**:
   - Define a workflow with one agent and two tool-mode nodes.
   - Verify the agent can successfully call both tools.
   - **Test Case 2 (Isolation)**: Create two agents with separate tools. Verify Agent A cannot "see" Agent B's tools.
2. **Proof**: Run the test and capture the output.
3. **Commit**: `test(e2e): verify multi-agent tool isolation and execution` (Signed-off).

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
