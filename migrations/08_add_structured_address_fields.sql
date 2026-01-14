-- Add structured address fields for better querying, sorting, and display
-- These fields store individual components of addresses for easier access

-- Add structured address columns
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS address_street VARCHAR(255);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS address_extended VARCHAR(255); -- Address line 2 (apartment, suite, etc.)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS address_city VARCHAR(100);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS address_state VARCHAR(50);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS address_postal VARCHAR(20);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS address_country VARCHAR(100);

-- Create indexes for common address queries
CREATE INDEX IF NOT EXISTS idx_contacts_address_city ON contacts(address_city);
CREATE INDEX IF NOT EXISTS idx_contacts_address_state ON contacts(address_state);
CREATE INDEX IF NOT EXISTS idx_contacts_address_postal ON contacts(address_postal);
CREATE INDEX IF NOT EXISTS idx_contacts_address_country ON contacts(address_country);

-- Migrate existing address data to structured fields
-- This parses the existing address field or addresses array
-- For addresses stored in vCard format (;;street;extended;city;state;postal;country)
DO $$
DECLARE
    contact_record RECORD;
    address_value TEXT;
    address_parts TEXT[];
    street_val TEXT;
    extended_val TEXT;
    city_val TEXT;
    state_val TEXT;
    postal_val TEXT;
    country_val TEXT;
BEGIN
    FOR contact_record IN
        SELECT id, address, addresses
        FROM contacts
        WHERE (address_street IS NULL OR address_city IS NULL)
    LOOP
        -- Try to get address from addresses array first, then fallback to address field
        address_value := NULL;

        -- Check addresses array (JSONB)
        IF contact_record.addresses IS NOT NULL AND jsonb_array_length(contact_record.addresses) > 0 THEN
            address_value := contact_record.addresses->0->>'value';
        ELSIF contact_record.address IS NOT NULL AND contact_record.address != '' THEN
            address_value := contact_record.address;
        END IF;

        -- If we have an address value, parse it
        IF address_value IS NOT NULL AND address_value != '' THEN
            -- Check if it's in vCard format (starts with ;;)
            IF address_value LIKE ';;%' THEN
                -- Parse vCard format: ;;street;extended;city;state;postal;country
                address_parts := string_to_array(address_value, ';');
                IF array_length(address_parts, 1) >= 7 THEN
                    street_val := NULLIF(TRIM(address_parts[3]), '');
                    extended_val := NULLIF(TRIM(address_parts[4]), '');
                    city_val := NULLIF(TRIM(address_parts[5]), '');
                    state_val := NULLIF(TRIM(address_parts[6]), '');
                    postal_val := NULLIF(TRIM(address_parts[7]), '');
                    country_val := NULLIF(TRIM(address_parts[8]), '');
                END IF;
            ELSE
                -- For plain text addresses, try to parse common formats
                -- This is a simplified parser - full parsing happens in application code
                -- For now, we'll extract what we can from comma-separated values
                address_parts := string_to_array(address_value, ',');
                IF array_length(address_parts, 1) >= 1 THEN
                    street_val := NULLIF(TRIM(address_parts[1]), '');
                END IF;
                -- Try to extract city (usually second-to-last or third-to-last)
                IF array_length(address_parts, 1) >= 2 THEN
                    city_val := NULLIF(TRIM(address_parts[array_length(address_parts, 1) - 1]), '');
                END IF;
                -- Try to extract state and ZIP from last part
                IF array_length(address_parts, 1) >= 1 THEN
                    DECLARE
                        last_part TEXT := TRIM(address_parts[array_length(address_parts, 1)]);
                        zip_match TEXT;
                    BEGIN
                        -- Try to match ZIP code (5 digits or 5+4 format)
                        zip_match := substring(last_part from '\d{5}(?:-\d{4})?$');
                        IF zip_match IS NOT NULL THEN
                            postal_val := zip_match;
                            state_val := NULLIF(TRIM(regexp_replace(last_part, '\d{5}(?:-\d{4})?$', '', 'g')), '');
                        ELSE
                            -- Might be just state
                            IF length(last_part) <= 3 THEN
                                state_val := last_part;
                            END IF;
                        END IF;
                    END;
                END IF;
            END IF;

            -- Update the contact with parsed values
            UPDATE contacts
            SET
                address_street = COALESCE(address_street, street_val),
                address_extended = COALESCE(address_extended, extended_val),
                address_city = COALESCE(address_city, city_val),
                address_state = COALESCE(address_state, state_val),
                address_postal = COALESCE(address_postal, postal_val),
                address_country = COALESCE(address_country, country_val)
            WHERE id = contact_record.id;
        END IF;
    END LOOP;
END $$;

-- Add comment to document the new columns
COMMENT ON COLUMN contacts.address_street IS 'Street address (line 1)';
COMMENT ON COLUMN contacts.address_extended IS 'Extended address (line 2: apartment, suite, unit, etc.)';
COMMENT ON COLUMN contacts.address_city IS 'City';
COMMENT ON COLUMN contacts.address_state IS 'State/Province';
COMMENT ON COLUMN contacts.address_postal IS 'Postal/ZIP code';
COMMENT ON COLUMN contacts.address_country IS 'Country';
