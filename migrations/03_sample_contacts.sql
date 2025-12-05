-- Sample contacts for initial setup
-- John Doe and Jane Doe with dummy information
-- This migration will only insert if the contacts don't already exist

-- Insert John Doe (only if not exists)
INSERT INTO contacts (
  vcard_id,
  full_name,
  first_name,
  last_name,
  email,
  phone,
  organization,
  job_title,
  address,
  notes,
  vcard_data
) VALUES (
  'sample-john-doe-001',
  'John Doe',
  'John',
  'Doe',
  'john.doe@example.com',
  '+1-555-0101',
  'Acme Corporation',
  'Software Engineer',
  '123 Main Street, Anytown, ST 12345',
  'Sample contact for testing purposes. Loves coding and coffee.',
  'BEGIN:VCARD' || E'\r\n' ||
  'VERSION:3.0' || E'\r\n' ||
  'UID:sample-john-doe-001' || E'\r\n' ||
  'FN:John Doe' || E'\r\n' ||
  'N:Doe;John;;;' || E'\r\n' ||
  'EMAIL;TYPE=INTERNET:john.doe@example.com' || E'\r\n' ||
  'TEL;TYPE=CELL:+1-555-0101' || E'\r\n' ||
  'ORG:Acme Corporation' || E'\r\n' ||
  'TITLE:Software Engineer' || E'\r\n' ||
  'ADR;TYPE=HOME:;;123 Main Street, Anytown, ST 12345;;;;' || E'\r\n' ||
  'NOTE:Sample contact for testing purposes. Loves coding and coffee.' || E'\r\n' ||
  'END:VCARD'
) ON CONFLICT (vcard_id) DO NOTHING;

-- Insert Jane Doe (only if not exists)
INSERT INTO contacts (
  vcard_id,
  full_name,
  first_name,
  last_name,
  email,
  phone,
  organization,
  job_title,
  address,
  notes,
  vcard_data
) VALUES (
  'sample-jane-doe-002',
  'Jane Doe',
  'Jane',
  'Doe',
  'jane.doe@example.com',
  '+1-555-0102',
  'Tech Solutions Inc',
  'Product Manager',
  '456 Oak Avenue, Somewhere, ST 67890',
  'Sample contact for testing purposes. Passionate about product design and user experience.',
  'BEGIN:VCARD' || E'\r\n' ||
  'VERSION:3.0' || E'\r\n' ||
  'UID:sample-jane-doe-002' || E'\r\n' ||
  'FN:Jane Doe' || E'\r\n' ||
  'N:Doe;Jane;;;' || E'\r\n' ||
  'EMAIL;TYPE=INTERNET:jane.doe@example.com' || E'\r\n' ||
  'TEL;TYPE=CELL:+1-555-0102' || E'\r\n' ||
  'ORG:Tech Solutions Inc' || E'\r\n' ||
  'TITLE:Product Manager' || E'\r\n' ||
  'ADR;TYPE=HOME:;;456 Oak Avenue, Somewhere, ST 67890;;;;' || E'\r\n' ||
  'NOTE:Sample contact for testing purposes. Passionate about product design and user experience.' || E'\r\n' ||
  'END:VCARD'
) ON CONFLICT (vcard_id) DO NOTHING;
