# Secret Store & Secret Fetch MVP

This document narrows the enterprise component initiative to the first deliverable: a
platform-managed secret store and a **Secret Fetch** component that exposes those
secrets to any flow node that declares secret-typed inputs.

## Objectives
- Provide a secure, centralized place for users to store credentials.
- Allow flows to consume secrets through a reusable Secret Fetch component instead of
  hardcoding credentials.
- Ensure any component input declared as a secret is masked in worker logs and UI
  telemetry.
- Validate at import/export time that required secrets exist before a flow can run.

## Secret Store Service (MVP)
- **Storage model**: `Secret` records hold metadata (name, description, tags, owner) and
  references to encrypted value blobs. Each record supports version history with one
  "active" version for runtime use.
- **Security posture**: encrypt secret values with a KMS or application-managed master
  key, enforce TLS for all API access, and restrict retrieval to authenticated users with
  the `secrets:read` scope. Write operations require the `secrets:manage` scope.
- **API surface**:
  - `POST /secrets` create secret with initial value and optional metadata.
  - `PUT /secrets/{id}/rotate` add a new version and mark it active.
  - `GET /secrets/{id}` fetch active version (masked value unless requester has
    `secrets:read:value`).
  - `GET /secrets/{id}/value` retrieve decrypted value for worker runtime; requires
    signed service token and is never available to browser clients.
- **Auditability**: every create/read/update/delete emits an audit event containing
  actor, timestamp, secret id, and action type.

## Secret Fetch Component
- **Purpose**: act as a single reusable node that resolves a named secret at runtime and
  emits the secret value as its output.
- **Configuration**:
  - `secretName` (required): dropdown backed by `GET /secrets` exposing only names and
    metadata.
  - `version` (optional): defaults to active; advanced users can pin to a specific version.
  - `outputFormat` (optional): raw string (default) or JSON decode for structured secrets.
- **Runtime behavior**:
  1. Worker resolves the selected secret id.
  2. Fetches the value via `GET /secrets/{id}/value` using worker credentials.
  3. Emits the decrypted value on the node's default output port typed as `secret`.
- **Error handling**: if the secret is missing or access is denied, the node fails fast and
  propagates a structured error instructing users to re-map the secret before re-running.

## Secret-Typed Inputs & Logging Hygiene
- Components can tag any input as `type: "secret"` in their schema.
- Flow builder enforces that only `secret` outputs (from Secret Fetch or other secret
  producers) can connect to those inputs.
- Worker runtime automatically masks secret-typed values in logs, traces, and failure
  payloads. Example masking strategy:
  - Replace the raw value with `***` when rendering log lines.
  - Store the unhashed value only in transient in-memory structures needed for execution.
- Telemetry dashboards and debugging UI display a generic placeholder instead of the
  actual secret value.

## Flow Lifecycle & Validation
- **Authoring**: users drag a Secret Fetch node into the canvas, select a secret, and wire
  its output to components requiring credentials.
- **Import/Export**: flow bundles include a manifest of referenced secret names. During
  import we verify that each name exists in the target environment; missing secrets block
  activation with actionable errors.
- **Pre-run check**: before execution the worker resolves each referenced secret id to
  confirm it is accessible. Failures are reported as pre-run validation errors rather than
  runtime crashes.

## Extensibility for External Secret Managers
- Introduce a provider abstraction so additional components (e.g., AWS Secrets Manager
  Fetch) can implement the same output contract (`secret` type).
- AWS component configuration:
  - Credentials secret (mapped via Secret Fetch) that grants AWS access.
  - Secret identifier (`arn` or name) and optional region override.
- The flow builder treats both the platform Secret Fetch and provider-specific components
  as valid sources for secret-typed connections, enabling hybrid setups where enterprise
  customers continue using their existing vaults.

## Next Steps
1. Implement the platform secret store service and worker client.
2. Ship the Secret Fetch component with masking and validation rules.
3. Extend component schema tooling so other nodes can declare secret inputs.
4. Add AWS Secrets Manager fetcher as the first external provider.
5. Monitor usage and expand with additional enterprise vault integrations as needed.

