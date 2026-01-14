-- Add contact photo storage fields
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS photo_blob BYTEA;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS photo_mime VARCHAR(50);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS photo_width INT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS photo_height INT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS photo_updated_at TIMESTAMP;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS photo_hash VARCHAR(64);

-- Index for photo hash lookups (optional, useful for dedupe)
CREATE INDEX IF NOT EXISTS idx_contacts_photo_hash ON contacts(photo_hash);
