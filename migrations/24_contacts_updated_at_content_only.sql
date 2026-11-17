-- Stop sync bookkeeping from counting as an edit.
--
-- contacts.updated_at is what the sync reads as "this row was edited here":
--
--   * radicale-to-db calls a card conflicted when updated_at is later than
--     last_synced_from_radicale_at, and sync/conflict.ts then keeps whichever
--     of updated_at and the file's mtime is newer.
--   * getContactsNeedingRadicaleSync selects rows whose updated_at is later
--     than last_synced_to_radicale_at.
--
-- The trigger from 01_init_schema restamped updated_at on every UPDATE, and
-- the sync service's own watermark writes (updateSyncMetadata) are UPDATEs. So
-- each pass that merely looked at a row made it read as freshly edited:
--
--   * Every row always qualified for the outbound pass, which restamped it
--     again, every tick.
--   * A card saved on a device within a moment of one of those stamps lost a
--     "conflict" against an edit nobody made. It then lost again on every
--     later pass, because the next stamp was always newer than the file. The
--     device kept its version, the database kept the old one, and the two never
--     converged. A list edited on a Mac, stuck at its old membership on the
--     server for two months, is the case that surfaced it.
--
-- updated_at now moves only when something other than the sync bookkeeping
-- columns changes. An UPDATE that sets updated_at itself is honoured, which the
-- repair at the bottom of this file relies on.

CREATE OR REPLACE FUNCTION update_contacts_updated_at()
RETURNS TRIGGER AS $$
DECLARE
    before contacts%ROWTYPE;
BEGIN
    -- Compare whole rows with the bookkeeping columns levelled out, rather
    -- than listing the content columns: a column added later then counts as
    -- content by default instead of being silently ignored.
    before := OLD;
    before.last_synced_from_radicale_at := NEW.last_synced_from_radicale_at;
    before.last_synced_to_radicale_at := NEW.last_synced_to_radicale_at;
    before.radicale_file_mtime := NEW.radicale_file_mtime;
    before.vcard_hash := NEW.vcard_hash;
    before.sync_source := NEW.sync_source;
    before.updated_at := NEW.updated_at;

    IF before IS DISTINCT FROM NEW THEN
        NEW.updated_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_contacts_updated_at ON contacts;
CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON contacts
    FOR EACH ROW EXECUTE FUNCTION update_contacts_updated_at();

-- Repair rows the old trigger left looking edited.
--
-- Their updated_at is the time of the last bookkeeping write, which is later
-- than anything on disk, so a device edit that already lost to it would keep
-- losing even with the trigger fixed. Pull updated_at back to the inbound
-- watermark so the next inbound pass sees no pending edit here and takes the
-- file.
--
-- Only rows with nothing waiting to be written out are touched:
--   * vcard_hash still matches vcard_data, so the stored card is the one the
--     sync last agreed with disk, and
--   * last_synced_to_radicale_at is set, since every write path in the web UI
--     nulls it to request a sync.
-- A row edited here and not yet written out keeps its updated_at and still
-- wins or loses its conflict on the timestamps, as before.
--
-- The real time of the last edit is not recoverable for these rows; the
-- watermark is the latest moment the row is known to have matched a client.
UPDATE contacts
SET updated_at = last_synced_from_radicale_at
WHERE last_synced_from_radicale_at IS NOT NULL
  AND last_synced_to_radicale_at IS NOT NULL
  AND updated_at > last_synced_from_radicale_at
  AND vcard_data IS NOT NULL
  AND vcard_hash IS NOT NULL
  AND vcard_hash = encode(sha256(convert_to(vcard_data, 'UTF8')), 'hex');
