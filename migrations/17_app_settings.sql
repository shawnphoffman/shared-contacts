-- Generic key/value settings store for admin-editable app configuration.
-- Used (initially) to persist the "brand" / organization string shown on
-- generated iOS .mobileconfig profiles, overriding the MOBILECONFIG_ORG env
-- var fallback. Additional settings can reuse this table.

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
