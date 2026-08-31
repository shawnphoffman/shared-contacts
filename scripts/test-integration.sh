#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="docker-compose.test.yml"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Host port for the throwaway Postgres. Override when 5433 is already taken.
TEST_POSTGRES_PORT="${TEST_POSTGRES_PORT:-5433}"
export TEST_POSTGRES_PORT
DATABASE_URL="postgresql://testuser:testpass@localhost:${TEST_POSTGRES_PORT}/testdb"

cleanup() {
  echo "Tearing down test containers..."
  docker compose -f "$PROJECT_DIR/$COMPOSE_FILE" down -v --remove-orphans 2>/dev/null || true
}
trap cleanup EXIT

echo "Starting test infrastructure..."
docker compose -f "$PROJECT_DIR/$COMPOSE_FILE" up -d --build --wait

echo "Running sync-service integration tests..."
DATABASE_URL="$DATABASE_URL" \
RADICALE_STORAGE_PATH="/tmp/radicale-test-data" \
  npm --prefix "$PROJECT_DIR/sync-service" run test:integration

echo "Running UI integration tests..."
DATABASE_URL="$DATABASE_URL" \
  npm --prefix "$PROJECT_DIR/ui" run test:integration
