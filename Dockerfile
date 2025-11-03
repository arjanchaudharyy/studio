# ShipSec Studio - Multi-Service Dockerfile
# Based on platform repo's workspace strategy

FROM oven/bun:alpine AS base

# Install system deps with build cache
RUN --mount=type=cache,target=/var/cache/apk \
    --mount=type=cache,target=/etc/apk/cache \
    apk add --no-cache ca-certificates python3 make g++ libc6-compat && \
    update-ca-certificates

WORKDIR /app
RUN addgroup -g 1001 shipsec && adduser -D -u 1001 -G shipsec shipsec

# Copy workspace files with proper ownership
COPY --chown=shipsec:shipsec bun.lock package.json bunfig.toml ./
COPY --chown=shipsec:shipsec packages/ packages/
COPY --chown=shipsec:shipsec backend/package.json backend/
COPY --chown=shipsec:shipsec frontend/package.json frontend/
COPY --chown=shipsec:shipsec worker/package.json worker/

# ============================================================================
# BACKEND DEPENDENCIES
# ============================================================================
FROM base AS backend-deps

RUN --mount=type=cache,target=/root/.bun/install/cache \
    --mount=type=cache,target=/root/.bun/cache \
    bun install --frozen-lockfile --filter @shipsec/studio-backend

# ============================================================================
# WORKER DEPENDENCIES
# ============================================================================
FROM base AS worker-deps

RUN --mount=type=cache,target=/root/.bun/install/cache \
    --mount=type=cache,target=/root/.bun/cache \
    bun install --frozen-lockfile --filter @shipsec/studio-worker

# ============================================================================
# FRONTEND BUILD
# ============================================================================
FROM base AS frontend-builder

RUN --mount=type=cache,target=/root/.bun/install/cache \
    --mount=type=cache,target=/root/.bun/cache \
    bun install --frozen-lockfile --filter @shipsec/studio-frontend

COPY --chown=shipsec:shipsec frontend/src frontend/src/
COPY --chown=shipsec:shipsec frontend/public frontend/public/
COPY --chown=shipsec:shipsec frontend/index.html frontend/
COPY --chown=shipsec:shipsec frontend/vite.config.ts frontend/
COPY --chown=shipsec:shipsec frontend/tsconfig.json frontend/
COPY --chown=shipsec:shipsec frontend/tsconfig.node.json frontend/

RUN cd frontend && bun run vite build

# ============================================================================
# BACKEND SERVICE
# ============================================================================
FROM backend-deps AS backend

COPY --chown=shipsec:shipsec backend/src backend/src/
COPY --chown=shipsec:shipsec backend/drizzle backend/
COPY --chown=shipsec:shipsec backend/drizzle.config.ts backend/
COPY --chown=shipsec:shipsec packages packages/
COPY --chown=shipsec:shipsec worker/src worker/src/
COPY --chown=shipsec:shipsec worker/bunfig.toml worker/
COPY --chown=shipsec:shipsec worker/tsconfig.json worker/

USER shipsec
WORKDIR /app/backend
EXPOSE 3211

CMD ["bun", "src/main.ts"]

# ============================================================================
# WORKER SERVICE
# ============================================================================
FROM worker-deps AS worker

COPY --chown=shipsec:shipsec worker/src worker/src/
COPY --chown=shipsec:shipsec packages packages/

USER shipsec
WORKDIR /app/worker

CMD ["bun", "src/temporal/workers/dev.worker.ts"]

# ============================================================================
# FRONTEND SERVICE (with nginx)
# ============================================================================
FROM nginx:1.27-alpine AS frontend

# Create nginx config for SPA
RUN echo 'server { \
    listen 8080; \
    server_name localhost; \
    root /usr/share/nginx/html; \
    index index.html; \
    \
    location / { \
        try_files $uri $uri/ /index.html; \
        add_header Cache-Control "no-cache, no-store, must-revalidate"; \
        add_header Pragma "no-cache"; \
        add_header Expires "0"; \
    } \
    \
    location /assets/ { \
        expires 1y; \
        add_header Cache-Control "public, immutable"; \
    } \
    \
    gzip on; \
    gzip_vary on; \
    gzip_min_length 1024; \
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json; \
}' > /etc/nginx/conf.d/default.conf

COPY --from=frontend-builder /app/frontend/dist /usr/share/nginx/html

RUN addgroup -g 1001 shipsec && adduser -D -u 1001 -G shipsec shipsec

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080 || exit 1

EXPOSE 8080
USER shipsec

CMD ["nginx", "-g", "daemon off;"]
