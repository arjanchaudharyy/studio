# OpenCode MCP Configuration Fix

## Problem

OpenCode v1.0.137+ introduced automatic OAuth detection for ALL remote MCP servers by default. This breaks authentication using custom headers (API keys, bearer tokens, etc.).

**Symptoms:**
- MCP servers configured with custom headers are never contacted
- OpenCode doesn't discover or use MCP tools
- No error message is shown (silent failure)

**Reference:** https://github.com/anomalyco/opencode/issues/5278

## Root Cause

Starting in OpenCode v1.0.137, the framework attempts OAuth authentication **first** for all remote MCP servers. Custom headers (like API keys) are only used when OAuth is explicitly disabled with `oauth: false`.

## Solution

Add `"oauth": false` to all remote MCP server configurations that use custom headers.

### Before (Broken)
```json
{
  "mcp": {
    "shipsec-gateway": {
      "type": "remote",
      "url": "http://localhost:3211/api/v1/mcp/gateway",
      "headers": {
        "Authorization": "Bearer TOKEN"
      }
    }
  }
}
```

### After (Fixed)
```json
{
  "mcp": {
    "shipsec-gateway": {
      "type": "remote",
      "url": "http://localhost:3211/api/v1/mcp/gateway",
      "oauth": false,
      "headers": {
        "Authorization": "Bearer TOKEN"
      }
    }
  }
}
```

## Implementation

**File Modified:** `worker/src/components/ai/opencode.ts`

The OpenCode component now generates the correct MCP configuration with `oauth: false`:

```typescript
const mcpConfig = gatewayToken
  ? {
      mcp: {
        'shipsec-gateway': {
          type: 'remote' as const,
          url: DEFAULT_GATEWAY_URL,
          oauth: false,  // ← CRITICAL FIX
          headers: {
            Authorization: `Bearer ${gatewayToken}`,
          },
          enabled: true,
        },
      },
    }
  : {};
```

## Validation

Run the configuration test to verify the fix:

```bash
bun test e2e-tests/opencode-config.test.ts
```

This validates:
- ✅ `oauth: false` is present in the MCP config
- ✅ Configuration structure is correct
- ✅ Old format is not used
- ✅ Comments reference the issue and version

## Testing

### Config Validation Test
```bash
bun test e2e-tests/opencode-config.test.ts
```
Result: ✅ 3/3 tests pass

### Isolated Docker Test
Created standalone MCP server + OpenCode container test:
- Node.js HTTP MCP server with UUID, Fibonacci, SHA256 tools
- Docker container running OpenCode
- Verified MCP tools are discovered and called correctly
- **Result:** ✅ OpenCode successfully calls MCP tools

## Impact

- ✅ OpenCode can now discover and use tools from the ShipSec MCP gateway
- ✅ Custom headers (API keys, bearer tokens) work correctly
- ✅ Backward compatible (only adds missing `oauth: false` flag)
- ✅ No changes needed to MCP gateway implementation
- ✅ No changes needed to other OpenCode functionality

## Related Issues

- [OpenCode Issue #5278](https://github.com/anomalyco/opencode/issues/5278) - z.ai MCPs stopped working
- [OpenCode Issue #5328](https://github.com/anomalyco/opencode/issues/5328) - Remote MCPs with auth header broke
- OpenCode Docs: https://opencode.ai/docs/mcp-servers/

## Migration Guide for Users

If you have a custom OpenCode workflow with remote MCP servers, update your `opencode.json`:

```json
{
  "mcp": {
    "my-server": {
      "type": "remote",
      "url": "https://my-mcp-server.com/mcp",
      "oauth": false,  // Add this line
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      }
    }
  }
}
```

Or use OpenCode's CLI to add servers:
```bash
opencode mcp add my-server --type remote --url https://my-mcp-server.com/mcp --no-oauth
```
