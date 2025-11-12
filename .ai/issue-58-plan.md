# Issue 58 – FileWriter Component

## Context
- Issue #58 requests a FileWriter that can persist component outputs either in the Artifact Library or in remote object storage (S3 now, GCS later).
- Issue #57 delivered the Artifact Writer and wired artifacts UI/download APIs, so we now have a working run + library storage path.
- Workers already expose `context.artifacts.upload`, but there is no abstraction yet for remote destinations or per-component destination toggles beyond run/library.

## Goals
1. Provide a first-class `core.file.writer` component so workflows can persist JSON/text/binary payloads to configured destinations.
2. Wire destination toggles into the workflow builder so any artifact-capable component can toggle “run” vs “library” vs future destinations.
3. Add (opt-in) support for uploading to an external S3 bucket with workspace-provided credentials; keep GCS for a later iteration.
4. Extend integration tests to cover saving artifacts + remote upload stubs so we keep parity with the playground flow.

## Proposed Approach

### Worker / Component SDK
- Create a shared helper (e.g., `artifactDestinationHelper.ts`) that normalizes “save to run”, “publish to library”, and “remote destinations”.
- Implement `core.file.writer`:
  - Inputs: `fileName`, `content` (string or base64), `mimeType`, `contentEncoding`, `destinations`, optional `s3Config`.
  - Determine buffer (Raw, base64, JSON stringify) and reuse helper to call `context.artifacts.upload`.
  - When `destination_type = s3`, initialize an AWS SDK S3 client using credentials pulled via `context.secrets` or direct config and upload to `${bucket}/${path}`.
  - Emit structured output describing stored artifact ID(s) and remote URLs.
- Update `packages/component-sdk` types if needed to declare remote destinations metadata for inspectors.

### Backend / API
- No schema changes for Artifact Library uploads (FileWriter uses existing `/artifacts` path).
- Add optional remote metadata fields when storing artifacts so UI can display remote URLs (e.g., extend `metadata` column to include `{ remoteUploads: [...] }`).
- Ensure `artifact.dto.ts` exposes those metadata fields so API consumers can show destination info.

### Frontend
- Introduce a generic “Artifact Destinations” config block in the builder sidebar. Components that set `metadata.capabilities.includes('artifacts')` will automatically show run/library toggles plus remote configuration (bucket/path/credential selector).
- Update Artifact Library / Run view to show remote destinations and provide download links for Artifact Library entries; remote URLs (S3) should display as external links.

### Testing / Validation
- Unit tests for `core.file.writer` covering string/buffer input, run/library toggles, and S3 upload (mock AWS client).
- Extend integration workflow (Temporal worker) to run FileWriter with local destination and assert artifact presence.
- Run `bun run lint`, `bun run test`, and targeted backend/service tests.

## Open Questions / Follow-ups
1. Secrets handling for S3: prefer referencing a secret ID (`s3CredentialId`) so the worker fetches `accessKeyId/secretAccessKey/region`.
2. Large payloads: FileWriter should stream if we expect >5MB data; currently buffer upload is fine but call it out in docs.
3. Future GCS/Azure support: design helper so new destination adapters can be registered without rewriting components.
4. Observability: record progress events when uploading to remote storage (similar to Artifact Writer).

## Deliverables Checklist
- [ ] Worker helper + `core.file.writer`.
- [ ] Frontend destination toggles + S3 form.
- [ ] Backend metadata exposure (if needed).
- [ ] Tests + docs (`.ai/file-storage-implementation.md`) + changelog entry.
