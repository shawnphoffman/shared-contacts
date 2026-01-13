#!/bin/sh
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to log messages
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" >&2
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARN:${NC} $1"
}

# Function to wait for a service to be ready
wait_for_service() {
    local host=$1
    local port=$2
    local service_name=$3
    local max_attempts=30
    local attempt=0

    log "Waiting for $service_name to be ready on $host:$port..."
    while [ $attempt -lt $max_attempts ]; do
        if nc -z "$host" "$port" 2>/dev/null; then
            log "$service_name is ready!"
            return 0
        fi
        attempt=$((attempt + 1))
        sleep 1
    done

    error "$service_name failed to start after $max_attempts attempts"
    return 1
}

# Function to cleanup on exit
cleanup() {
    log "Shutting down services..."

    # Kill all child processes
    kill -TERM $RADICALE_PID 2>/dev/null || true
    kill -TERM $SYNC_PID 2>/dev/null || true
    kill -TERM $UI_PID 2>/dev/null || true

    # Wait for processes to exit
    wait $RADICALE_PID 2>/dev/null || true
    wait $SYNC_PID 2>/dev/null || true
    wait $UI_PID 2>/dev/null || true

    log "All services stopped"
    exit 0
}

# Set up signal handlers
trap cleanup SIGTERM SIGINT

# Initialize Radicale users file if it doesn't exist
if [ ! -f /data/users ]; then
    log "Creating empty users file..."
    touch /data/users 2>/dev/null || true
    chmod 666 /data/users 2>/dev/null || chmod 644 /data/users 2>/dev/null || true
    log "Users file created. Add users with: docker exec -it <container> htpasswd -B /data/users username"
fi

# Start Radicale in background
log "Starting Radicale (CardDAV server)..."
/app/bin/python /app/bin/radicale --config /config/config &
RADICALE_PID=$!

# Wait for Radicale to be ready
if ! wait_for_service localhost 5232 "Radicale"; then
    error "Failed to start Radicale"
    exit 1
fi

# Start sync-service in background
log "Starting sync-service..."
cd /app/sync-service
node dist/index.js &
SYNC_PID=$!

# Wait for sync-service to be ready
if ! wait_for_service localhost 3001 "sync-service"; then
    error "Failed to start sync-service"
    exit 1
fi

# Start UI in background (we'll keep the script running)
log "Starting UI..."
cd /app/ui
export NODE_ENV=${NODE_ENV:-production}
export PORT=${PORT:-3030}
export HOST=${HOST:-0.0.0.0}
node .output/server/index.mjs &
UI_PID=$!

# Wait for UI to be ready
if ! wait_for_service localhost 3030 "UI"; then
    error "Failed to start UI"
    exit 1
fi

log "All services started successfully!"
log "Radicale (CardDAV): http://localhost:5232"
log "Sync Service API: http://localhost:3001"
log "Web UI: http://localhost:3030"

# Keep the script running and wait for signals
wait
