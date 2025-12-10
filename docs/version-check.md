# Version Check Client

ShipSec Studio now performs a version compatibility check whenever the backend boots. The backend process calls the Cloudflare worker published at `https://version.shipsec.ai/api/version/check` and reacts according to the server response.

## When it runs

- **Backend bootstrap** – `backend/src/main.ts` invokes the version check before Nest starts listening. Any path that launches the backend (PM2, Docker, `bun --cwd backend run dev`, etc.) hits the endpoint once during startup.

If the endpoint reports `is_supported=false`, the backend logs an error and exits. `should_upgrade=true` prints a warning without blocking. Network failures log a warning and allow the workflow to continue (fail-open).

## Configuration knobs

| Variable | Purpose |
| --- | --- |
| `SHIPSEC_VERSION_CHECK_DISABLED` | Set to `1`/`true` to skip the check (development overrides only). |
| `SHIPSEC_VERSION_CHECK_URL` | Override the base URL (defaults to `https://version.shipsec.ai`). |
| `SHIPSEC_VERSION_CHECK_APP` | Override the `app` query parameter (defaults to `studio`). |
| `SHIPSEC_VERSION_CHECK_VERSION` | Override the client version string (falls back to the workspace `package.json` version). |
| `SHIPSEC_VERSION_CHECK_TIMEOUT_MS` | HTTP timeout in milliseconds (default `5000`). |
| `SHIPSEC_WORKSPACE_ID` | Populates the optional `workspace` query param when available. |
| `SHIPSEC_INSTANCE_ID` | Force a specific installation identifier. Otherwise it is generated and stored automatically. |

## CLI output semantics

| Outcome | Behaviour |
| --- | --- |
| Supported | Backend logs confirmation and continues startup. |
| Upgrade available | Backend logs a warning mentioning the latest version and upgrade URL. |
| Unsupported | Backend logs an error and exits with status `1`. |
| Error / offline | Backend logs a warning but continues (fail-open). |

Watch backend logs for `[version-check]` entries to see the exact decision path.
