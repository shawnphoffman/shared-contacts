-- Add nickname column to contacts table
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS nickname VARCHAR(100);

