# ENG-104 End-to-End Alert Investigation Workflow

This E2E test exercises the **full MCP tool stack**:
- Tool‑mode components (AbuseIPDB + VirusTotal)
- MCP servers in Docker (AWS CloudTrail + CloudWatch)
- MCP gateway discovery + execution
- OpenCode agent (Z.AI GLM‑4.7) producing a markdown report

## Files
- Test: `e2e-tests/eng-104-alert-investigation.test.ts`
- Sample payload: `e2e-tests/fixtures/guardduty-alert.json`
- Env template: `e2e-tests/.env.eng-104.example`

## Required secrets
Copy the template, fill real values, and export it as env:

```bash
cp e2e-tests/.env.eng-104.example .env.eng-104
# edit .env.eng-104
set -a; source .env.eng-104; set +a
```

Or use the interactive helper:

```bash
bun e2e-tests/scripts/setup-eng-104-env.ts
set -a; source .env.eng-104; set +a
```

## Run
```bash
RUN_E2E=true bun test e2e-tests/eng-104-alert-investigation.test.ts
```

## Notes
- This test creates temporary secrets via the backend API and cleans them up at the end.
- AWS MCP images must exist locally or be pullable:
  - `shipsec/mcp-aws-cloudtrail:latest`
  - `shipsec/mcp-aws-cloudwatch:latest`
- The MCP containers are expected to run on localhost only.
- The OpenCode report is validated for `Summary`, `Findings`, and `Actions` headings.
