# ShipSec Studio Agent Playbook

## 1. Mission
- Deliver reliable, observable workflow automation for security reconnaissance in line with `.ai/claude-spec.md`.
- Move the repository toward the observability roadmap in `.ai/implementation-plan.md` while preserving existing behaviour and data integrity.
- Keep humans in the loop: surface assumptions, blockers, and validation gaps promptly.

## 0. Capability Check
- Identify whether your execution environment exposes CORE Memory (Codex CLI tool `corememory__*`).
- **If CORE is available:** follow the memory-first workflow below.
- **If CORE is unavailable:** rely on `.ai` docs, recent git history, and open issues for context; keep a written trail in repo docs or the PR description so teammates inherit your findings.

## 2. Core Operating Loop
1. **Gather context**  
   - With CORE Memory: run a search before answering any user message to pull history, decisions, and preferences.  
   - Without CORE Memory: review relevant `.ai` docs, recent commits, and any prior notes in the repository before proceeding.
2. **Study context**: skim `.ai` documents and recent code touching the task. Default references:
   - `.ai/claude-spec.md` for system architecture and APIs.
   - `.ai/visual-execution-notes.md` and `.ai/implementation-plan.md` for observability status and runbook details.
   - Other `.ai/*.md` files as needed (component SDK, worker architecture, marketplace notes).
3. **Plan** the work when it is more than a trivial change. Plans must have multiple steps, at most one active step, and be updated as progress is made. Skip planning only for straightforward tasks.
4. **Execute carefully**:
   - Prefer `rg` for search; use `["bash","-lc", "<cmd>"]` with `workdir` set on all shell calls.
   - Use `apply_patch` for handcrafted edits to single files; avoid it for large auto-generated diffs.
   - Keep edits ASCII unless the file already uses other characters.
   - Never undo or overwrite unrelated user changes; avoid destructive commands (`git reset --hard`, `rm -rf`, etc.).
5. **Validate** results via targeted tests or reasoning. Default test commands:
   - `bun run test`
   - `bun run --filter backend test`
   - `bun run lint`, `bun run typecheck`
   - Backend integration suites may need services started with Docker + PM2 (see §5).
6. **Document & Store**  
   - CORE-enabled agents: ingest a summary into CORE Memory capturing the interaction and any follow-ups.  
   - Non-CORE agents: append findings to an appropriate repo log (e.g., `.ai/visual-execution-notes.md`, issue tracker, or PR summary) so the next contributor has continuity.

## 3. Coding Standards
- Align with repository architecture: Temporal workflows orchestrate component activities; components are registered via the ShipSec SDK (`.ai/component-sdk.md`).
- Uphold observability contract schemas from `@shipsec/shared` and `docs/execution-contract.md`.
- Keep commits (when requested) small and reviewable. Do not create commits unless the user asks.
- Add concise comments only when logic is non-obvious.
- Maintain consistent import/order/style with existing code; prefer existing utilities over new dependencies.

## 4. Communication & Delivery
- Final responses must be concise, reference touched files (`path:line`), and highlight risks or follow-ups.
- Present findings before summaries when performing reviews.
- Offer practical next actions (tests, docs, PR steps) when they naturally follow from the work.
- State clearly when something could not be validated or requires human attention.

## 5. Environment & Tooling Notes
- Infrastructure stack: Temporal, Postgres, MinIO, Loki (Phase 5+) started via `docker compose up -d`.
- Runtime processes: use `pm2` (`pm2 start`, `pm2 status`, `timeout 5s pm2 logs ...`) with orphan Bun processes cleaned before restarting.
- Worker separation and task-queue strategy described in `.ai/temporal-worker-architecture.md` and `.ai/worker-implementation-example.md`.
- Live execution experience depends on trace streaming (Phase 6) and UI updates described in `.ai/visual-execution-notes.md`.

## 6. Observability Roadmap Snapshot
- Phase 0–7 complete; Phase 8 (metrics + regression suite) not started.
- Trace + Loki pipeline (Phase 5) and live streaming (Phase 6) are active; ensure new work preserves these contracts.
- Backlog items for the execution timeline remain open (see `.ai/implementation-plan.md` Phase 8 checklist).

## 7. Document Map
- `.ai/bounty-hunter-painpoints.md`: user persona & pain points.
- `.ai/component-sdk.md`: component interfaces, runner configuration, execution context.
- `.ai/file-storage-implementation.md`: artifact storage strategy (S3/MinIO expectations).
- `.ai/implementation-plan.md`: observability phases, required tests, environment runbook.
- `.ai/sample-workflow-dsl.md`: DSL structure for workflow definitions.
- `.ai/shipsec-differentiators.md`: positioning vs competitors.
- `.ai/temporal-worker-architecture.md`: task queue strategy and worker specialization.
- `.ai/tracecat-temporal-overview.md`: external comparison insights.
- `.ai/visual-execution-notes.md`: audit findings, infrastructure status, UX expectations.
- `.ai/worker-implementation-example.md`: end-to-end worker example with logging & progress emission.

## 8. When Blocked
- Capture the issue, attempted approaches, and uncertainties in the response.
- Suggest concrete follow-ups (information needed, commands to rerun, potential fixes).
- CORE-enabled agents: store the blocker in CORE Memory.  
  Non-CORE agents: record the blocker in a shared doc or ticket so the next teammate can resume quickly.
