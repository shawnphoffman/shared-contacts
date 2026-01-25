-- Sentinel table for one-time path migration: slug -> id in Radicale storage.
-- Sync-service checks this table on startup; if no row exists, it renames
-- collection-root/{slug} -> collection-root/{id} (and per-user dirs) then inserts a row.
CREATE TABLE IF NOT EXISTS path_migration_done (
  id SERIAL PRIMARY KEY,
  done_at TIMESTAMPTZ DEFAULT NOW()
);
