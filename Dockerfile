# Stage 1: Build sync-service
FROM node:20-alpine AS sync-builder

WORKDIR /app/sync-service

# Copy package files
COPY sync-service/package*.json ./
COPY sync-service/tsconfig.json ./

# Install all dependencies (including dev dependencies for TypeScript build)
# Use npm install instead of npm ci to handle potential lock file mismatches
RUN npm install && npm cache clean --force

# Copy source code
COPY sync-service/src ./src

# Build TypeScript
RUN npm run build

# Stage 2: Build ui
FROM node:22-alpine AS ui-builder

WORKDIR /app/ui

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY ui/package.json ui/pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY ui/ .

# Build the application
RUN pnpm build

# Stage 3: Production runtime - based on Radicale with Node.js
FROM ghcr.io/kozea/radicale:latest

# Switch to root to install Node.js and set up services
USER root

# Install Node.js 22 (for ui) and Node.js 20 (for sync-service)
# We'll use Node 22 for both since it's backward compatible
# Also install netcat for health checks in entrypoint script
RUN apk add --no-cache nodejs npm netcat-openbsd && \
	npm install -g pnpm && \
	rm -rf /var/cache/apk/*

# Create directories for services
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
COPY --from=ui-builder /app/ui/pnpm-lock.yaml /app/ui/pnpm-lock.yaml
COPY --from=ui-builder /app/ui/node_modules /app/ui/node_modules

# Copy root package.json for about metadata
COPY package.json /app/package.json

# Copy migrations (needed by both sync-service and ui)
COPY migrations /app/migrations

# Copy entrypoint script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Create init script for radicale (similar to original)
RUN cat > /init-radicale.sh << 'EOF' && chmod +x /init-radicale.sh
#!/bin/sh
if [ ! -f /data/users ]; then
echo "Creating empty users file..."
touch /data/users 2>/dev/null || true
chmod 666 /data/users 2>/dev/null || chmod 644 /data/users 2>/dev/null || true
echo "Users file created. Add users with: docker exec -it <container> htpasswd -B /data/users username"
fi
exec /app/bin/python /app/bin/radicale --config /config/config
EOF

# Expose ports
EXPOSE 3030 3001 5232

# Set working directory
WORKDIR /app

# Use our custom entrypoint
ENTRYPOINT ["/docker-entrypoint.sh"]
