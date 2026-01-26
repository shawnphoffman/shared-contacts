-- Sentinel table for one-time composite user migration.
-- Sync-service checks this table on startup; if no row exists, it creates
-- composite CardDAV users (username-bookid) for all existing user-address-book assignments,
-- then inserts a row to mark completion.
CREATE TABLE IF NOT EXISTS composite_users_migration_done (
  id SERIAL PRIMARY KEY,
  done_at TIMESTAMPTZ DEFAULT NOW()
);
