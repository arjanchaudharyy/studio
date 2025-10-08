# Agent Execution Guidelines

1. **Time-box commands.** Always run CLI commands with sensible timeouts to avoid hanging processes.
2. **Run long-lived services in the background.** Use process managers (e.g., `pm2`) to keep servers running while continuing other tasks.
3. **Check for port conflicts** before starting servers; stop or kill existing processes using the same port.
4. **Document environment needs** (e.g., `.env` values, Docker services) before running commands.
5. **Stop background processes** when they are no longer required to keep the workspace clean.
6. **Keep Docker Compose services port-mapped carefully** to avoid collisions with host Postgres.
