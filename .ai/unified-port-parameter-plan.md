# Unified Port + Parameter System (Full Cutover)

## Intent
Move to the unified port/parameter API with explicit UI for inputs (including connection status + manual overrides) and eliminate all legacy paths.

## Process Rules
- After each phase, check off completed items and add brief Phase Notes.
- End each phase with one or more commits.
- Update this plan if scope changes.

## Phase 0: RFC Alignment
Todos:
- [x] Update RFC to show Inputs in the ConfigPanel with connection/override status.
- [x] Record the no-backcompat stance in the RFC.

### Phase Notes
- RFC now specifies Parameters + Inputs sections, with manual overrides and `valuePriority` behavior.

## Phase 1: SDK + Types
Intent: Ship the new core API in `@shipsec/component-sdk`.
Todos:
- [x] Add `port()`, `param()`, `inputs()`, `outputs()`, `parameters()` helpers.
- [x] Add branded schema types (`PortSchema`, `ParamSchema`, etc.).
- [x] Update `ComponentDefinition` + `defineComponent` typing to use new shapes.
- [x] Update port/parameter metadata extraction helpers for UI/validation.
- [x] Add or update component-sdk unit tests.
- [ ] Commit checkpoint.

### Phase Notes
- Introduced `defineComponent` + unified schema builders without breaking legacy `ComponentDefinition`.
- Registry now extracts parameters from `parameters()` schemas, with legacy UI parameters as fallback.

## Phase 2: Backend Compiler + Workflow Schema
Intent: Compile params + input overrides into workflow actions.
Todos:
- [ ] Extend workflow action schema to store `params` and port override values.
- [ ] Update DSL compiler to extract params + overrides from node config.
- [ ] Update DSL validation to use separated schemas.
- [ ] Add/adjust backend tests (compiler + validation).
- [ ] Commit checkpoint.

## Phase 3: Worker Runtime
Intent: Execute components with separated inputs/params and override rules.
Todos:
- [ ] Update activity payload to `{ inputs, params }`.
- [ ] Resolve inputs from mappings + overrides (respect `valuePriority`).
- [ ] Update worker tests or add coverage for overrides.
- [ ] Commit checkpoint.

## Phase 4: Frontend UI + Data Model
Intent: Surface inputs + parameters with clear status and overrides.
Todos:
- [ ] Update node config shape to store parameter values + input overrides.
- [ ] ConfigPanel renders Parameters + Inputs sections from schemas.
- [ ] Inputs show Connected/Manual/Empty status.
- [ ] Manual override editor uses `PortMeta.editor` and `valuePriority`.
- [ ] Remove any `ui.parameters` usage.
- [ ] Commit checkpoint.

## Phase 5: Component Migration
Intent: Migrate all components to the unified API.
Todos:
- [ ] Split each component into `inputs`, `outputs`, `parameters`.
- [ ] Update `execute` signatures to `{ inputs, params }`.
- [ ] Remove `ui.parameters` from component definitions.
- [ ] Commit checkpoint (can be multiple commits by component group).

## Phase 6: Cleanup + Enforcement
Intent: Remove legacy paths and lock the new system.
Todos:
- [ ] Remove deprecated helpers/legacy typing paths.
- [ ] Add lint rule to forbid `ui.parameters`.
- [ ] Update docs/runbooks to reflect the new system.
- [ ] Commit checkpoint.

## Validation (End of Each Phase)
- [ ] `bun run typecheck`
- [ ] `bun run lint`
- [ ] `bun run test` (plus targeted backend/worker suites as needed)
