# ShipSec Studio – Workflow Scheduler Refactor Plan

This document lays out the refactor required to bring our workflow runtime on par with best-in-class orchestration engines (e.g., Tracecat). The focus is a deterministic, parallel-capable scheduler that preserves full DAG structure, emits rich traces, and keeps components isolated. Treat each phase as independently reviewable and insist on tests before advancing.

---

## Progress Overview

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 0 | ⚪ Not Started | Baseline Audit & Gap Analysis |
| Phase 1 | ⚪ Not Started | DSL & Schema Enrichment |
| Phase 2 | ⚪ Not Started | Scheduler Core Implementation |
| Phase 3 | ⚪ Not Started | Context, Services & Tracing Hardening |
| Phase 4 | ⚪ Not Started | Error Handling & Join Semantics |
| Phase 5 | ⚪ Not Started | Integration Tests & Temporal Validation |
| Phase 6 | ⚪ Not Started | Frontend & API Alignment |
| Phase 7 | ⚪ Not Started | Performance, Guardrails & Rollout |

**Primary Objective:** Execute workflows with true parallelism, deterministic joins, and structured trace/log output—without regressing current behaviour.

---

## Phase 0 – Baseline Audit & Gap Analysis

**Goal:** Document exactly how the current compiler/runtime behave and identify all blockers to parallel execution.

- [x] Diagram current `WorkflowDefinition` (fields emitted by `compileWorkflowGraph`) and how edges/handles map to params.
- [x] Trace the existing worker loop (`executeWorkflow`) to highlight serialization points, shared state, and trace emissions.
- [x] Review Temporal worker setup to confirm activity boundaries, retry policies, and service injection.
- [x] Capture findings in `.ai/visual-execution-notes.md`, especially pain points to resolve in later phases.
- [x] Run `bun --cwd worker test` to validate current runtime.
- [x] Manual dry-run of a multi-branch workflow via Temporal to observe baseline behaviour.

**Deliverable:** Audit notes with explicit TODOs feeding into Phases 1–4.

---

## Phase 1 – DSL & Schema Enrichment

**Goal:** Have the DSL compiler emit the full DAG (nodes + edges + metadata) so the worker can schedule without guesswork.

- [x] Extend `WorkflowDefinition` (`worker/src/temporal/types.ts`) with:
  - `edges` array (source, target, edgeType, handles).
  - `incomingCounts` or equivalent indegree metadata.
  - Optional `joinStrategy`, `groupId`, `runnerConfig` overrides.
- [x] Update `backend/src/dsl/compiler.ts` to build the enriched structure (retain adjacency, join metadata).
- [x] Ensure component metadata (e.g., concurrency hints) is passed through. *(Added metadata fields; runtime currently supplies labels only until richer hints exist.)*
- [x] Version the schema (e.g., `definitionVersion`) so stored workflows can be migrated.
- [x] Tests:
  - Unit tests for compiler (`backend/src/dsl/__tests__/compiler.spec.ts` or new) with diamonds, scatter-like graphs.
  - Validate Zod schema or shared type definitions.

> **Implementation sketch:** Introduce `WorkflowEdge` (`{ id, sourceRef, targetRef, sourceHandle?, targetHandle?, kind: 'success' | 'error' }`) and `WorkflowNodeMetadata` (`{ ref, joinStrategy?: 'all' | 'any' | 'first', maxConcurrency?: number, groupId?: string }`). `WorkflowDefinition` should gain `version`, `nodes` (map of metadata), `edges`, and retain `actions` for backward compatibility during migration. Compiler must populate these structures directly from `WorkflowGraph`, preserving all handles and categories.

**Deliverable:** New workflow definition type + compiler output validated by tests.

---

## Phase 2 – Scheduler Core Implementation

**Goal:** Replace the sequential loop with an indegree-driven scheduler that executes ready nodes concurrently.

- [ ] Introduce a `WorkflowScheduler` module in the worker:
  - Maintain `pendingDeps`, `dependents`, `readyQueue`, and per-node status.
  - Dequeue zero-incoming nodes, execute batches via `Promise.allSettled`.
  - Update downstream indegrees as parents finish.
- [ ] Build `Deferred`/`ResultHandle` so each node’s output is stored as a promise that dependents can await.
- [ ] Respect per-node concurrency caps (from component metadata or runner config).
- [ ] Ensure entrypoint nodes consume runtime inputs without blocking others.
- [ ] Tests:
  - Unit tests for the scheduler with synthetic components (sleep/deterministic output).
  - Validate parallel timing (e.g., two 500 ms sleeps complete in ~500 ms).

**Deliverable:** New scheduler class with unit tests demonstrating true parallelism.

---

## Phase 3 – Context, Services & Tracing Hardening

**Goal:** Make execution contexts concurrency-safe and instrumented.

- [ ] Refactor `createExecutionContext` to produce immutable per-node contexts, including `streamId`/`branchId`.
- [ ] Guard adapters (`TraceAdapter`, log adapter, storage) against concurrent access (per-run maps, locks, or clones).
- [ ] Emit structured trace events (`NODE_STARTED`, `NODE_COMPLETED`, `NODE_FAILED`, `NODE_SKIPPED`) with timestamps and metadata.
- [ ] Ensure log forwarding includes node metadata for downstream consumers.
- [ ] Propagate runner config (`inline`, `docker`, `remote`) without breaking the new concurrency model.
- [ ] Tests:
  - Concurrent trace emission unit test.
  - Verify logs include node refs in integration harness.

**Deliverable:** Thread-safe context + adapters with structured tracing.

---

## Phase 4 – Error Handling & Join Semantics

**Goal:** Define deterministic behaviour for merges, failures, and skips.

- [ ] Support join strategies (`all`, `any`, `first`, future-proof for `quorum`) and enforce them in the scheduler.
- [ ] On node failure, propagate according to policy (fail workflow, skip dependents, or route to error edges when available).
- [ ] Ensure undefined inputs throw deterministic errors (no silent `warn` + continue).
- [ ] Add cancellation hooks so upstream cancellation can short-circuit dependents.
- [ ] Tests:
  - Unit tests for join strategies (e.g., `any` continues after first success).
  - Failure propagation tests for diamonds and scatter/gather.

**Deliverable:** Behaviour matrix documented + covered by tests.

---

## Phase 5 – Integration Tests & Temporal Validation

**Goal:** Validate the scheduler in the full Temporal worker.

- [ ] Update `worker/src/temporal/workflow-runner.ts` to use the new scheduler and context.
- [ ] Extend integration tests (`worker/src/temporal/__tests__/workflow-runner.test.ts`) with:
  - Parallel fan-out/fan-in workflow.
  - Scatter-like scenario (multiple dependents sharing a parent).
  - Failure case ensuring run result includes error and trace data.
- [ ] Run end-to-end Temporal workflow via `worker/scripts/workflow-runner.ts` to confirm logs/traces.
- [ ] Benchmark simple workflows to confirm no regressions in serial cases.

**Deliverable:** Passing Temporal integration suite demonstrating new behaviour.

---

## Phase 6 – Frontend & API Alignment

**Goal:** Surface the richer execution metadata to users.

- [ ] Update backend responses (status/trace endpoints) to emit new trace events and join info.
- [ ] Adjust frontend stores (`executionTimelineStore`, canvas overlays) to render parallel branches and join outcomes.
- [ ] Add UI indicators for node concurrency (e.g., multiple branches running) and improved error messaging.
- [ ] Ensure API client shares typed definitions (via `@shipsec/shared`) reflecting schema changes.
- [ ] Tests:
  - Frontend unit tests for timeline updates.
  - Manual run to verify UI reflects parallelism.

**Deliverable:** UI + API operating with the new runtime metadata.

---

## Phase 7 – Performance, Guardrails & Rollout

**Goal:** Harden the system for production loads and ship.

- [ ] Add global concurrency caps and per-component rate limits (configurable).
- [ ] Instrument metrics (queue depth, active nodes, failures) for observability.
- [ ] Feature-flag rollout if needed (toggle between old/new scheduler during soak).
- [ ] Write migration notes + runbook updates (e.g., how to debug runs under the new scheduler).
- [ ] Regression suite: deterministic workflow run snapshot to guard against future changes.

**Deliverable:** Production-ready runtime with guardrails, metrics, and documentation.

---

## Operational Checklist (All Phases)

- Ensure Docker + pm2 stack is running (`docker compose up -d`, `pm2 start`).
- Run targeted tests before/after major changes:
  - `bun run --filter backend test`
  - `bun --cwd worker test`
  - `bun run test` (full suite)
- Keep `.ai/visual-execution-notes.md` updated with discoveries and decisions.
- Document partial progress in this plan (update statuses, add notes).

---

### Change Log

- `2025-10-15` – Initial version drafted: parallel scheduler refactor plan.
