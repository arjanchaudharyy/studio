#!/usr/bin/env just

# ShipSec Studio - Simplified Docker Setup
# Run `just` to see available commands

default:
    @just --list

# === Infrastructure Only ===
infra-up:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "🚀 Starting Docker infrastructure..."
    docker compose -f docker/docker-compose.infra.yml up -d
    echo "✅ Infrastructure started"
    echo "📊 Services:"
    echo "   - PostgreSQL: localhost:5433"
    echo "   - Temporal: localhost:7233"
    echo "   - Temporal UI: http://localhost:8081"
    echo "   - MinIO: http://localhost:9000 (minioadmin/minioadmin)"
    echo "   - MinIO Console: http://localhost:9001"
    echo "   - Loki: http://localhost:3100"

infra-down:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "🛑 Stopping infrastructure..."
    docker compose -f docker/docker-compose.infra.yml down
    echo "✅ Infrastructure stopped"

infra-logs:
    docker compose -f docker/docker-compose.infra.yml logs -f

infra-clean:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "🧹 Cleaning infrastructure..."
    docker compose -f docker/docker-compose.infra.yml down -v
    docker volume prune -f
    echo "✅ Infrastructure cleaned"

# === Full Docker Setup ===
up:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "🚀 Starting full Docker environment..."
    docker compose -f docker/docker-compose.full.yml up -d
    echo "✅ Full environment started"
    echo "📊 Services:"
    echo "   - Frontend: http://localhost"
    echo "   - Backend API: http://localhost:3211"
    echo "   - PostgreSQL: localhost:5433"
    echo "   - Temporal: localhost:7233"
    echo "   - Temporal UI: http://localhost:8081"
    echo "   - MinIO Console: http://localhost:9001"

down:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "🛑 Stopping full environment..."
    docker compose -f docker/docker-compose.full.yml down
    echo "✅ Full environment stopped"

logs:
    docker compose -f docker/docker-compose.full.yml logs -f

clean:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "🧹 Cleaning full environment..."
    docker compose -f docker/docker-compose.full.yml down -v
    docker system prune -f
    docker volume prune -f
    echo "✅ Full environment cleaned"

# === Local Development ===
dev:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "🚀 Starting local development (Docker infra + PM2 apps)..."
    just infra-up
    sleep 10
    echo "📦 Installing dependencies..."
    bun install
    echo "🚀 Starting applications with PM2..."
    bun run dev:infra

dev-stop:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "🛑 Stopping local development..."
    bun run dev:stack:stop
    just infra-down

# === Utilities ===
status:
    @echo "📊 Docker container status:"
    @echo ""
    @echo "Infrastructure:"
    @docker compose -f docker/docker-compose.infra.yml ps 2>/dev/null || echo "  Not running"
    @echo ""
    @echo "Full environment:"
    @docker compose -f docker/docker-compose.full.yml ps 2>/dev/null || echo "  Not running"

build:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "🔨 Building application images..."
    docker compose -f docker/docker-compose.full.yml build backend frontend worker
    echo "✅ Images built"

# === Help ===
help:
    @echo "ShipSec Studio - Simplified Docker Setup"
    @echo ""
    @echo "Infrastructure Only (recommended for development):"
    @echo "  just infra-up      # Start Docker infrastructure"
    @echo "  just infra-down    # Stop infrastructure"
    @echo "  just infra-logs    # View infrastructure logs"
    @echo "  just infra-clean   # Clean infrastructure"
    @echo ""
    @echo "Full Docker (recommended for production):"
    @echo "  just up            # Start everything in Docker"
    @echo "  just down          # Stop everything"
    @echo "  just logs          # View all logs"
    @echo "  just clean         # Clean everything"
    @echo ""
    @echo "Local Development:"
    @echo "  just dev           # Docker infra + PM2 apps"
    @echo "  just dev-stop      # Stop local development"
    @echo ""
    @echo "Utilities:"
    @echo "  just status        # Show container status"
    @echo "  just build         # Build application images"