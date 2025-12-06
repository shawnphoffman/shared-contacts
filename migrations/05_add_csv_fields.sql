-- Add missing fields from CSV import
-- These fields exist in the CSV but weren't in the original schema

-- Add birthday field (bday in CSV)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS birthday DATE;

-- Add middle name field (middle in CSV)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS middle_name VARCHAR(100);

-- Add maiden name field (maiden in CSV)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS maiden_name VARCHAR(100);

-- Add homepage/website field (homepage in CSV)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS homepage VARCHAR(255);

-- Add index for birthday (useful for queries like "upcoming birthdays")
CREATE INDEX IF NOT EXISTS idx_contacts_birthday ON contacts(birthday);
