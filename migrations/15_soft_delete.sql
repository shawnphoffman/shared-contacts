-- Add soft delete support with deleted_at column
ALTER TABLE contacts ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Index for efficiently querying deleted contacts
CREATE INDEX idx_contacts_deleted_at ON contacts (deleted_at) WHERE deleted_at IS NOT NULL;
