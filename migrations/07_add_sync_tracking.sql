-- Add sync tracking fields for bi-directional sync support
-- These fields enable change detection and prevent sync loops

-- Add sync tracking columns
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_synced_from_radicale_at TIMESTAMP;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_synced_to_radicale_at TIMESTAMP;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS vcard_hash VARCHAR(64);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS sync_source VARCHAR(20);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS radicale_file_mtime TIMESTAMP;

-- Create indexes for sync queries
CREATE INDEX IF NOT EXISTS idx_contacts_sync_source ON contacts(sync_source);
CREATE INDEX IF NOT EXISTS idx_contacts_last_synced_to_radicale ON contacts(last_synced_to_radicale_at);
CREATE INDEX IF NOT EXISTS idx_contacts_last_synced_from_radicale ON contacts(last_synced_from_radicale_at);

-- Migrate existing contacts: set initial sync timestamps and calculate hashes
-- For existing contacts, assume they were synced at creation/update time
UPDATE contacts
SET
  last_synced_from_radicale_at = COALESCE(created_at, NOW()),
  last_synced_to_radicale_at = COALESCE(updated_at, NOW()),
  sync_source = NULL, -- Unknown source for existing data
  radicale_file_mtime = NULL -- Will be populated on next sync
WHERE last_synced_from_radicale_at IS NULL;

-- Calculate vCard hash for existing contacts that have vcard_data
-- Using PostgreSQL's digest function (requires pgcrypto extension)
-- If extension is not available, we'll calculate it in the application
DO $$
BEGIN
  -- Check if pgcrypto extension exists
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
    UPDATE contacts
    SET vcard_hash = encode(digest(vcard_data, 'sha256'), 'hex')
    WHERE vcard_data IS NOT NULL AND vcard_hash IS NULL;
  END IF;
END $$;
