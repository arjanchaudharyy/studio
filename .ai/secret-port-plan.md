# Secret Delivery Plan

## Problem
- Any component currently receives `context.secrets` and can fetch arbitrary secrets just by holding a secret ID.
- API-oriented components (OpenAI, Gemini, Okta, Subfinder, etc.) each accept secret IDs as parameters and call the secrets adapter directly.
- This bypasses the goal of “secrets flow through ports”, makes it hard to audit which component touched which secret, and increases the chance that values get logged or mis-handled.
- Destinations (e.g. S3) also pull secrets directly, so we can’t enforce boundaries around credential usage.

## Solution
1. **Port-driven secrets**  
   - Introduce a single Secret Loader component (`core.secret.fetch`) that is the *only* module allowed to call `context.secrets`. It takes a secret ID (configured via the builder) and emits the decrypted string on a secret port.
   - Add a `credential` port type (sensitive payload, masked like `secret`) for structured credential bundles.
   - Build higher-level bundlers (starting with AWS credentials) that consume multiple secret ports and emit a credential object.

2. **Context restrictions**  
   - Extend component definitions with `requiresSecrets`. The worker only injects `context.secrets` when this flag is true. Every other component sees `context.secrets === undefined`.
   - Mark only the Secret Loader component (and any future secret-specialized component) with `requiresSecrets`.

3. **Consumer rewrites**  
   - Update AI/security components, AWS adapters, etc. to remove secret ID parameters and replace them with secret or credential input ports. They now consume values supplied via connections from the loader/bundlers.
   - S3 destination accepts an AWS credential bundle port instead of fetching secrets internally.

4. **Testing / enforcement**  
   - Unit tests validate that components now error if the required secret/credential port is missing, and never reach for `context.secrets`.
   - Run `bun run test` + `.playground` workflows to ensure the new wiring works end-to-end.

## Outcome
- Secrets only originate from loader components; consumers can’t bypass the boundary.
- Credential bundles stay in memory as sensitive ports (redacted in logs/traces).
- The worker enforces the contract by withholding the secrets adapter from unauthorized components.

## Progress / Next Steps
- ✅ SDK + worker support (`credential` port, `requiresSecrets`, guarded injection).
- ✅ Secret Loader renamed + marked as the only component with `requiresSecrets`.
- ✅ AWS credential bundler and S3 destination/adapter refactored to use credential ports.
- ✅ OpenAI, OpenRouter, Gemini chat components now require secret inputs instead of secret IDs.
- 🚧 AI Agent still accepts `chatModel.apiKeySecretId`; needs to be reworked into a chat-model adapter flow (future task).
- ✅ Security/IT components (Subfinder, Okta Offboard, Atlassian Offboarding) now rely on secret/credential ports only; docs + tests updated to reflect the new flow.
- 🚧 Builder UI still shows legacy secret-id parameters; follow-up needed to surface credential ports more clearly.
