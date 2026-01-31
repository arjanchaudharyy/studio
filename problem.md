# Problem: OpenCode Not Using MCP Tools

## Summary
OpenCode agent is not using MCP tools even though:
- Tools are registered to MCP gateway
- Gateway tokens are generated successfully
- MCP config is passed to OpenCode

Instead, OpenCode is using its built-in Bash tool.

## Current State

### What Works
1. ✅ Tool Registration: MCP tools (abuseipdb, virustotal, cloudtrail, cloudwatch) are successfully registered in backend tool registry
2. ✅ Gateway Initialization: MCP gateway service starts correctly
3. ✅ Token Generation: Worker generates valid gateway tokens
4. ✅ MCP Config: OpenCode config shows MCP is "ENABLED"
5. ✅ PTY Mode: OpenCode is running with PTY streaming

### What Doesn't Work
1. ❌ Gateway Not Called: MCP gateway's `registerTools()` function is NEVER invoked
2. ❌ Tools Not Discovered: OpenCode doesn't receive registered MCP tools
3. ❌ Wrong Tool Used: OpenCode uses `Bash` tool instead of MCP tools

### Evidence from Logs
```
[agent] [OpenCode] Generated gateway token successfully (length: 39)
[agent] [OpenCode] MCP Config: ENABLED, URL: http://localhost:3211/api/v1/mcp/gateway
```
Backend logs show gateway is NEVER contacted during OpenCode execution.

## Root Cause Analysis
OpenCode is NOT connecting to our MCP gateway at all. The `getServerForRun()` method in `backend/src/mcp/mcp-gateway.service.ts` is never called.

## Isolated Testing Approach

To understand how OpenCode MCP configuration works without ShipSec backend/gateway complexity, we're running isolated tests.

### Test Environment
Location: `/tmp/opencode-mcp-test`

### Test Components
1. **Simple HTTP MCP Server** (`http_mcp_server.js`)
   - Implements MCP protocol: `initialize`, `tools/list`, `tools/call`
   - Runs on localhost:8000
   - Returns two tools: `echo` and `get_time`

2. **OpenCode Docker Container**
   - Uses `ghcr.io/anomalyco/opencode` image
   - Runs with `--network host` to access localhost
   - Mounts `/workspace` volume with config files

3. **OpenCode Config**
   ```json
   {
     "mcp": {
       "test-server": {
         "type": "remote",
         "url": "http://localhost:8000/mcp",
         "headers": {
           "Authorization": "Bearer test-token"
         }
       }
     }
   }
   ```

### What We're Testing

#### Config Format 1: ❌ `mcp.servers.{name}.transport` (OLD/WRONG)
```json
{
  "mcp": {
    "servers": {
      "test": {
        "transport": {
          "type": "http",
          "url": "..."
        }
      }
    }
  }
}
```
Result: OpenCode connected to MCP but used Bash instead of MCP tools.

#### Config Format 2: ✅ `mcp.{name}.type: "remote"` (CORRECT)
From official OpenCode docs: https://opencode.ai/docs/mcp-servers/

```json
{
  "mcp": {
    "test-server": {
      "type": "remote",
      "url": "http://localhost:8000/mcp",
      "headers": {
        "Authorization": "Bearer TOKEN"
      }
    }
  }
}
```

## Next Steps

1. ✅ Verify correct MCP config format (DONE)
2. 🔄 Update OpenCode component to use correct format (IN PROGRESS)
3. 🔄 Test with isolated environment first
4. 🔄 Run E2E test with updated config
5. 🔄 Verify gateway receives tool discovery requests
6. 🔄 Verify OpenCode uses MCP tools instead of Bash

## Files Modified

- `worker/src/components/ai/opencode.ts` - Updated MCP config format to use `type: "remote"`
- `backend/src/mcp/mcp-gateway.service.ts` - Added extensive logging
- `backend/src/mcp/tool-registry.service.ts` - Added registration logging
- `worker/src/temporal/activities/mcp.activity.ts` - Added logging
