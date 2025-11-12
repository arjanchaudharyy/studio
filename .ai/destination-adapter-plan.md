# Destination Adapter Plan

## Objective
Decouple “where to store outputs” from writer components by routing destination selection through adapters that can be supplied via workflow connections (including bring-your-own components), while keeping execution inside each component’s Temporal activity.

## Architecture Overview
1. **Destination contract** – Shared Zod schema (`@shipsec/shared`) defining `{ adapterId: string; config: Record<string, unknown> }` plus metadata (label, capabilities). This becomes a first-class port type (`port.contract('destination.writer')`).
2. **Adapter registry (worker)** – New module (e.g., `worker/src/destinations/registry.ts`) that exposes `registerAdapter({ id, label, create })` and `getAdapter(id)`. Factories return a runtime handler `{ save(payload, context) }`.
3. **Destination provider components** – Components whose sole output is a destination contract object (examples: `core.destination.artifact` for run/library, `core.destination.s3`, later `core.destination.gcs`). Bring-your-own adapters will plug into the same registry (design now, implementation later).
4. **Writer components** – Inputs change from ad-hoc toggles to a `destination` port + optional manual controls. At `execute`, they resolve the adapter from the registry and call its `save` function, passing `{ buffer, fileName, mimeType, metadata, context }`. No extra Temporal activity is spawned; everything runs inside the writer’s existing activity context.
5. **Builder UX (phase 2)** – Workflow Builder eventually gets a dedicated control for destination ports (manual adapter selection + connection indicator). Visual polish (badges, colors) can wait; initial implementation can reuse existing parameter styling.
6. **Runtime context** – Adapter handlers receive the execution context (with `artifacts`, `secrets`, `logger`, etc.). They may call existing services (`context.artifacts.upload`, AWS SDK, HTTP clients) and can emit progress/log events.

## Implementation Steps
### Phase 1 (core infra)
1. **Shared contracts**
   - Add `DestinationConfigSchema` + related TypeScript types in `packages/shared`.
   - Export helper metadata needed for builder auto-forms (e.g., `DestinationParameterSchema[]`).

2. **Worker registry**
   - Create `destinationRegistry` with register/get/list helpers.
   - Register built-in adapters (`artifactRun`, `artifactLibrary`, `s3`) during worker bootstrap.
   - Expose a `DestinationContext` (buffer info + execution context) passed into each adapter.

3. **Destination providers**
   - Implement `core.destination.artifact` (wraps run/library toggles) and `core.destination.s3` (bucket, prefix, credentials).
   - Document how future/bring-your-own providers will hook in, but defer runtime upload of adapters for now.

4. **Writer updates**
   - Refactor `core.file.writer` (and eventually other writer-type components) to accept a `destination` input referencing the contract.
   - Provide a compatibility mode (treat old boolean fields as “artifact destination” for existing workflows) during migration.

5. **Testing & rollout**
   - Unit tests for the registry + adapters (mocking `context.artifacts` / AWS SDK).
   - Integration test that wires `core.destination.artifact` into `core.file.writer` and verifies artifact + remote metadata.
   - UI tests (or Storybook) showing manual vs connected destination controls.
   - Migration notes instructing teams to replace boolean toggles with destination nodes once the new UI ships.

### Phase 2 (BYO + UX polish)
6. **Bring-your-own adapters**
   - Extend the registry API so external modules (including bring-your-own components) can register adapters at runtime.
   - Define allowed helper surface and security guardrails.

7. **Builder UX & visual polish**
   - Introduce destination-specific styling (badges on nodes, unique connector appearance).
   - Provide adapter picker dialogs, searchable registry list, and richer validation messaging.

## Open Questions
1. **Schema-driven forms:** Do we encode adapter config metadata directly in the adapter registration call, or in shared config definitions? (Leaning toward including it in the registration so builder can render forms automatically.)
2. **Security guardrails:** For bring-your-own adapters, define what services/helpers they can access—likely the same execution context but with documentation on safe usage.
3. **Versioning:** Decide how to handle workflows referencing adapters that are later removed or renamed; plan for fallback/validation during workflow load.
