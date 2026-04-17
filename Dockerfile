# Stage 1: Build sync-service
FROM node:22-alpine AS sync-builder

WORKDIR /app/sync-service

# Copy package files
COPY sync-service/package*.json ./
COPY sync-service/tsconfig.json ./

# Install all dependencies (including dev dependencies for TypeScript build)
RUN npm ci && npm cache clean --force

# Copy source code
COPY sync-service/src ./src

# Build TypeScript
RUN npm run build

# Remove dev dependencies after build
RUN npm prune --omit=dev

# Stage 2: Build ui
FROM node:22-alpine AS ui-builder

WORKDIR /app/ui

# Copy package files
COPY ui/package.json ui/package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY ui/ .

# Build the application
RUN npm run build

# Remove dev dependencies after build
RUN npm prune --omit=dev

# Stage 3: Production runtime - based on Radicale with Node.js
FROM ghcr.io/kozea/radicale:latest

# Switch to root to install Node.js and set up services
USER root

# Install Node.js 22 (for ui) and Node.js 20 (for sync-service)
# We'll use Node 22 for both since it's backward compatible
# Also install netcat for health checks in entrypoint script and openssl
# for optional .mobileconfig signing (openssl smime -sign).
RUN apk add --no-cache nodejs npm netcat-openbsd openssl && \
	rm -rf /var/cache/apk/*

# Create directories for services
# Note: the base Radicale image declares VOLUME /var/lib/radicale which
# creates an anonymous volume at runtime. We intentionally do NOT symlink
# it to /data — doing so causes Docker to shadow bind mounts at /data
# with the anonymous volume. The unused /var/lib/radicale volume is harmless.
RUN mkdir -p /app/sync-service /app/ui /data /config

# Copy radicale config
COPY radicale/config/config /config/config
COPY radicale/config/rights /config/rights

# Copy built sync-service
COPY --from=sync-builder /app/sync-service/dist /app/sync-service/dist
COPY --from=sync-builder /app/sync-service/package*.json /app/sync-service/
COPY --from=sync-builder /app/sync-service/node_modules /app/sync-service/node_modules

# Copy built ui
COPY --from=ui-builder /app/ui/.output /app/ui/.output
COPY --from=ui-builder /app/ui/package.json /app/ui/package.json
COPY --from=ui-builder /app/ui/package-lock.json /app/ui/package-lock.json
COPY --from=ui-builder /app/ui/node_modules /app/ui/node_modules

# Copy root package.json for about metadata
COPY package.json /app/package.json

# Copy migrations (needed by both sync-service and ui)
COPY migrations /app/migrations

# Copy entrypoint script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# OCI image metadata
LABEL org.opencontainers.image.title="Shared Contacts"
LABEL org.opencontainers.image.description="Self-hostable CardDAV server for managing shared contacts"
LABEL org.opencontainers.image.licenses="AGPL-3.0-or-later"
LABEL org.opencontainers.image.source="https://github.com/shawnphoffman/shared-contacts"

# Expose ports
EXPOSE 3030 3001 5232

# Set working directory
WORKDIR /app

# TODO: Run as non-root user — requires entrypoint changes to handle
# volume ownership (mounted volumes ignore in-image chown). Implement
# with gosu/su-exec: start as root, fix permissions, then drop to appuser.

# Built-in health check against the UI server
HEALTHCHECK --interval=1m --timeout=10s --retries=3 --start-period=60s \
  CMD node -e "require('http').get('http://localhost:3030/api/health',(r)=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

# Use our custom entrypoint
ENTRYPOINT ["/docker-entrypoint.sh"]
