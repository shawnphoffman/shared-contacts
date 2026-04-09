#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="docker-compose.test.yml"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cleanup() {
  echo "Tearing down test containers..."
  docker compose -f "$PROJECT_DIR/$COMPOSE_FILE" down -v --remove-orphans 2>/dev/null || true
}
trap cleanup EXIT

echo "Starting test infrastructure..."
docker compose -f "$PROJECT_DIR/$COMPOSE_FILE" up -d --build --wait

echo "Running integration tests..."
DATABASE_URL="postgresql://testuser:testpass@localhost:5433/testdb" \
RADICALE_STORAGE_PATH="/tmp/radicale-test-data" \
  npm --prefix "$PROJECT_DIR/sync-service" run test:integration
