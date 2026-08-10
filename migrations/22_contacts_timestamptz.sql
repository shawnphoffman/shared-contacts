-- Give the contacts timestamps a time zone.
--
-- These columns were TIMESTAMP (no zone) while two different writers stamped
-- them from two different clocks:
--
--   * updated_at and created_at come from the update_contacts_updated_at
--     trigger, i.e. Postgres NOW() in the database session's zone (UTC).
--   * last_synced_*, radicale_file_mtime and photo_updated_at are JS Date
--     values handed to node-postgres, which serializes them in the *app
--     process's* local zone. Into a zone-less column, Postgres keeps the
--     wall-clock digits and discards the offset.
--
-- With the app container on America/Los_Angeles, that put updated_at seven
-- hours ahead of a last_synced_to_radicale_at written by the same statement.
-- Two things fell out of it, both silent:
--
--   * Conflict resolution compares contacts.updated_at against a real file
--     mtime (sync/conflict.ts). Read back seven hours in the future, the DB
--     copy won every conflict, so no edit made in a CardDAV client ever
--     survived: it was reverted on the next outbound pass. Renaming a list on
--     a Mac is the case that surfaced it.
--   * getContactsNeedingRadicaleSync compares the same two columns, so every
--     contact always qualified and every card was rewritten on every pass.
--
-- TIMESTAMPTZ stores an absolute instant, so both writers agree no matter what
-- zone either process runs in, and this cannot come back if TZ drifts again.
--
-- Existing values are interpreted as UTC, which is right for the two the
-- trigger wrote and wrong by the app's offset for the ones the app wrote. The
-- sync watermarks are not worth reinterpreting (the offset moved with DST and
-- we cannot tell which row was written under which), and they are pure
-- bookkeeping, so they are cleared instead and rebuilt on the next pass, the
-- same approach 21_contact_groups took. photo_updated_at is left as converted:
-- it only busts a cache, and being off by the old offset once is harmless.
--
-- Other tables keep TIMESTAMP for now. Nothing compares their values against a
-- clock outside the database, which is the only thing that made this a bug.

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_name = 'contacts'
			AND column_name = 'updated_at'
			AND data_type = 'timestamp without time zone'
	) THEN
		ALTER TABLE contacts
			ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
			ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC',
			ALTER COLUMN photo_updated_at TYPE TIMESTAMPTZ USING photo_updated_at AT TIME ZONE 'UTC',
			ALTER COLUMN last_synced_from_radicale_at TYPE TIMESTAMPTZ USING last_synced_from_radicale_at AT TIME ZONE 'UTC',
			ALTER COLUMN last_synced_to_radicale_at TYPE TIMESTAMPTZ USING last_synced_to_radicale_at AT TIME ZONE 'UTC',
			ALTER COLUMN radicale_file_mtime TYPE TIMESTAMPTZ USING radicale_file_mtime AT TIME ZONE 'UTC';
	END IF;
END $$;

-- Clear the watermarks so the next pass rebuilds them from one clock. A null
-- inbound watermark also skips the conflict check for one pass, which is what
-- we want: the files are the side that has been losing, and taking them back
-- is a no-op wherever the DB copy already matched.
UPDATE contacts
SET last_synced_from_radicale_at = NULL,
	last_synced_to_radicale_at = NULL,
	radicale_file_mtime = NULL
WHERE last_synced_from_radicale_at IS NOT NULL
	OR last_synced_to_radicale_at IS NOT NULL
	OR radicale_file_mtime IS NOT NULL;
