-- Add support for multiple phone numbers, emails, addresses, and URLs
-- Using JSONB arrays to store multiple values with their types

-- Add JSONB columns for multiple values
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS phones JSONB DEFAULT '[]'::jsonb;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS emails JSONB DEFAULT '[]'::jsonb;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS addresses JSONB DEFAULT '[]'::jsonb;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS urls JSONB DEFAULT '[]'::jsonb;

-- Migrate existing single values to arrays
-- For phones: [{"value": "phone_number", "type": "CELL"}]
UPDATE contacts
SET phones = CASE
  WHEN phone IS NOT NULL AND phone != '' THEN jsonb_build_array(jsonb_build_object('value', phone, 'type', 'CELL'))
  ELSE '[]'::jsonb
END
WHERE phones IS NULL OR phones = '[]'::jsonb;

-- For emails: [{"value": "email@example.com", "type": "INTERNET"}]
UPDATE contacts
SET emails = CASE
  WHEN email IS NOT NULL AND email != '' THEN jsonb_build_array(jsonb_build_object('value', email, 'type', 'INTERNET'))
  ELSE '[]'::jsonb
END
WHERE emails IS NULL OR emails = '[]'::jsonb;

-- For addresses: [{"value": "address", "type": "HOME"}]
UPDATE contacts
SET addresses = CASE
  WHEN address IS NOT NULL AND address != '' THEN jsonb_build_array(jsonb_build_object('value', address, 'type', 'HOME'))
  ELSE '[]'::jsonb
END
WHERE addresses IS NULL OR addresses = '[]'::jsonb;

-- For URLs: [{"value": "https://example.com", "type": "HOME"}]
UPDATE contacts
SET urls = CASE
  WHEN homepage IS NOT NULL AND homepage != '' THEN jsonb_build_array(jsonb_build_object('value', homepage, 'type', 'HOME'))
  ELSE '[]'::jsonb
END
WHERE urls IS NULL OR urls = '[]'::jsonb;

-- Create indexes for JSONB queries
CREATE INDEX IF NOT EXISTS idx_contacts_phones ON contacts USING GIN (phones);
CREATE INDEX IF NOT EXISTS idx_contacts_emails ON contacts USING GIN (emails);
CREATE INDEX IF NOT EXISTS idx_contacts_addresses ON contacts USING GIN (addresses);
CREATE INDEX IF NOT EXISTS idx_contacts_urls ON contacts USING GIN (urls);

-- Create a function to extract email values for searching (for backward compatibility)
CREATE OR REPLACE FUNCTION get_primary_email(emails_jsonb JSONB) RETURNS TEXT AS $$
BEGIN
  IF jsonb_array_length(emails_jsonb) > 0 THEN
    RETURN emails_jsonb->0->>'value';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create a function to extract phone values for searching (for backward compatibility)
CREATE OR REPLACE FUNCTION get_primary_phone(phones_jsonb JSONB) RETURNS TEXT AS $$
BEGIN
  IF jsonb_array_length(phones_jsonb) > 0 THEN
    RETURN phones_jsonb->0->>'value';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
