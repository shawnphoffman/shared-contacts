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

# Stop all known children, first politely then forcefully. Returns once every
# child we started has exited.
stop_all_children() {
    # Send SIGTERM to any still-running children.
    for pid in $RADICALE_PID $SYNC_PID $UI_PID; do
        [ -n "$pid" ] && kill -TERM "$pid" 2>/dev/null || true
    done

    # Give them up to ~10s to exit gracefully.
    attempt=0
    while [ $attempt -lt 10 ]; do
        all_dead=1
        for pid in $RADICALE_PID $SYNC_PID $UI_PID; do
            if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
                all_dead=0
                break
            fi
        done
        [ $all_dead -eq 1 ] && return 0
        attempt=$((attempt + 1))
        sleep 1
    done

    # Anything still running gets force-killed.
    for pid in $RADICALE_PID $SYNC_PID $UI_PID; do
        [ -n "$pid" ] && kill -KILL "$pid" 2>/dev/null || true
    done
}

# Function to cleanup on exit — invoked by the SIGTERM/SIGINT trap when the
# container itself is being stopped. Exits 0 so Docker doesn't treat this as
# a crash.
cleanup() {
    log "Shutting down services..."
    stop_all_children
    log "All services stopped"
    exit 0
}

# Set up signal handlers
trap cleanup SIGTERM SIGINT

# ---------------------------------------------------------------------------
# Privilege handling
#
# We start as root only long enough to fix ownership on mounted volumes (which
# ignore any chown baked into the image), then run every service as an
# unprivileged user. PUID/PGID let that user match a host account so files on
# bind mounts — notably BACKUP_DIR — are readable without sudo. The defaults
# are 1000:1000, the `radicale` user the base image already ships.
# ---------------------------------------------------------------------------
APP_UID=${PUID:-1000}
APP_GID=${PGID:-1000}

# Ensure the ids resolve to real accounts. Radicale is Python, which looks the
# running uid up in /etc/passwd in places; a bare numeric id would fail there.
ensure_account() {
    if ! getent group "$APP_GID" >/dev/null 2>&1; then
        addgroup -g "$APP_GID" appuser 2>/dev/null || true
    fi
    if ! getent passwd "$APP_UID" >/dev/null 2>&1; then
        group_name=$(getent group "$APP_GID" | cut -d: -f1)
        adduser -D -H -u "$APP_UID" -G "${group_name:-appuser}" appuser 2>/dev/null || true
    fi
}

# chown -R over the paths the services write to. Best effort: a read-only or
# root-squashed mount should degrade to a clear failure later rather than
# stopping the container from booting.
take_ownership() {
    for path in "$@"; do
        [ -e "$path" ] || continue
        if ! chown -R "$APP_UID:$APP_GID" "$path" 2>/dev/null; then
            warn "Could not change ownership of $path; services may fail to write there"
        fi
    done
}

# Run a command as the unprivileged user.
as_app_user() {
    su-exec "$APP_UID:$APP_GID" "$@"
}

ensure_account

# Initialize Radicale users file if it doesn't exist
if [ ! -f /data/users ]; then
    log "Creating empty users file..."
    touch /data/users 2>/dev/null || true
    log "Users file created. Add CardDAV users on the Book Users page in the web UI."
fi

# /data holds the Radicale collections and the htpasswd file; BACKUP_DIR holds
# the archives. On an upgrade from a root-running version this is a one-time
# recursive chown of the existing volume.
log "Preparing data directories for uid=$APP_UID gid=$APP_GID..."
take_ownership /data "${BACKUP_DIR:-/backups}" /var/lib/radicale

# Set NODE_ENV for all services
export NODE_ENV=${NODE_ENV:-production}

# Start Radicale in background
log "Starting Radicale (CardDAV server)..."
as_app_user /app/bin/python /app/bin/radicale --config /config/config &
RADICALE_PID=$!

# Wait for Radicale to be ready
if ! wait_for_service localhost 5232 "Radicale"; then
    error "Failed to start Radicale"
    stop_all_children
    exit 1
fi

# Start sync-service in background
log "Starting sync-service..."
cd /app/sync-service
as_app_user node dist/index.js &
SYNC_PID=$!

# Wait for sync-service to be ready
if ! wait_for_service localhost 3001 "sync-service"; then
    error "Failed to start sync-service"
    stop_all_children
    exit 1
fi

# Start UI in background (we'll keep the script running)
log "Starting UI..."
cd /app/ui
export PORT=${PORT:-3030}
export HOST=${HOST:-0.0.0.0}
as_app_user node .output/server/index.mjs &
UI_PID=$!

# Wait for UI to be ready
if ! wait_for_service localhost 3030 "UI"; then
    error "Failed to start UI"
    stop_all_children
    exit 1
fi

log "All services started successfully!"
log "Radicale (CardDAV): http://localhost:5232"
log "Sync Service API: http://localhost:3001"
log "Web UI: http://localhost:3030"

# Supervise children: if any of them exits, tear the others down and exit
# non-zero so Docker's restart policy recreates the container. The old
# behaviour was a bare `wait`, which blocked until ALL children exited — so
# a single crashed service left PID 1 running forever and the container
# stuck in an unhealthy state.
while true; do
    if ! kill -0 "$RADICALE_PID" 2>/dev/null; then
        error "Radicale (pid=$RADICALE_PID) exited unexpectedly; restarting container"
        stop_all_children
        exit 1
    fi
    if ! kill -0 "$SYNC_PID" 2>/dev/null; then
        error "sync-service (pid=$SYNC_PID) exited unexpectedly; restarting container"
        stop_all_children
        exit 1
    fi
    if ! kill -0 "$UI_PID" 2>/dev/null; then
        error "UI (pid=$UI_PID) exited unexpectedly; restarting container"
        stop_all_children
        exit 1
    fi
    sleep 5
done
