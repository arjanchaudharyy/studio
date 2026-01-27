# OpenCode Agent E2E Testing - RESOLVED

## Progress Summary

### ✅ All Completed
1. **Z.AI Provider Added** - `zai-coding-plan` provider added to LLMProviderSchema
2. **Component Fixes** - OpenCode component updated with:
   - Proper model string format: `zai-coding-plan/glm-4.7`
   - Provider config with `apiKey` in `provider.options.apiKey`
   - MCP config fix: `type: "remote"` instead of `transport: "http"`
3. **E2E Tests Fixed and Passing** - All issues resolved:
   - **`--quiet` flag doesn't exist** in opencode 1.1.34, changed to `--log-level ERROR`
   - **Wrapper script approach** to handle prompt file reading inside container
   - **Entry point override** using `/bin/sh` to execute wrapper script
   - **Test assertions fixed** - changed from `output?.report` to `outputSummary?.report`

---

## Root Cause - The `--quiet` Flag Issue

### Discovery
The `--quiet` flag **does not exist** in opencode version 1.1.34. When used, opencode shows help text instead of executing the command.

### Manual Verification
```bash
# This shows help (wrong):
docker run ... ghcr.io/anomalyco/opencode run --quiet "hello"

# This works (correct):
docker run ... ghcr.io/anomalyco/opencode run --log-level ERROR "hello"
```

---

## Final Implementation

### Wrapper Script Approach
The prompt is written to `prompt.txt` and read by a wrapper script inside the container:

```typescript
// Write wrapper script that reads prompt from file
const wrapperScript = '#!/bin/sh\nopencode run --log-level ERROR "$(cat /workspace/prompt.txt)"\n';

await volume.initialize({
  'context.json': contextJson,
  'opencode.jsonc': JSON.stringify(opencodeConfig, null, 2),
  'prompt.txt': finalPrompt,
  'run.sh': wrapperScript,
});

// Execute with /bin/sh entrypoint
const runnerConfig = {
  ...definition.runner,
  entrypoint: '/bin/sh',
  command: ['/workspace/run.sh'],
  network: 'host' as const,
  volumes: [volume.getVolumeConfig('/workspace', false)],
  workingDir: '/workspace',
};
```

### Why This Works
1. **`entrypoint: '/bin/sh'`** overrides the image's default `opencode` entrypoint
2. **Wrapper script** runs inside the container, so `$(cat /workspace/prompt.txt)` is evaluated by the container shell
3. **`--log-level ERROR`** suppresses verbose logging (replaces the non-existent `--quiet` flag)

---

## Test Results

### E2E Tests: ✅ PASSING
```
bun test e2e-tests/opencode.test.ts

  2 pass
  0 fail
  10 expect() calls
Ran 2 tests across 1 file. [30.31s]
```

### Tests Implemented
1. **Basic Test** - OpenCode agent runs with Z.AI GLM-4.7
2. **Context Test** - OpenCode agent uses context from input (JSON data)

---

## Key Findings

### OpenCode Configuration
1. **Z.AI Native Provider**: `zai-coding-plan` is a first-class provider in OpenCode
2. **Model Format**: `zai-coding-plan/glm-4.7` (provider/modelId)
3. **API Key**: Goes in `provider.zai-coding-plan.options.apiKey`
4. **MCP Format**: `mcp.{name}: {type: 'remote', url: '...'}`
5. **No `--quiet` flag**: Use `--log-level ERROR` instead

### Docker Execution Pattern
For complex commands with shell expansion:
- Write a wrapper script to a file
- Use `/bin/sh` as entrypoint
- Execute the wrapper script as the command

---

## Environment

- **ZAI_API_KEY**: `aa8e1ccdcb48463aa3def6939a959a5c.GK2rlnuBm76aHRaI`
- **GLM Model**: `zai-coding-plan/glm-4.7`
- **Studio API**: Running on `http://127.0.0.1:3211`
- **OpenCode Version**: 1.1.34

---

## Files Modified

1. `packages/contracts/src/index.ts` - Added `zai-coding-plan` provider schema
2. `worker/src/components/ai/opencode.ts` - Fixed command execution and removed `--quiet` flag
3. `e2e-tests/opencode.test.ts` - Created E2E tests and fixed assertions
