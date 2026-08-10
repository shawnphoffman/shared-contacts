-- CardDAV group cards, shown as "lists" under an address book in Apple Contacts.
--
-- A list is not a server-side concept. Apple stores it as an ordinary vCard in
-- the same collection, marked with X-ADDRESSBOOKSERVER-KIND:group and carrying
-- one X-ADDRESSBOOKSERVER-MEMBER line per member (vCard 4 clients use the
-- unprefixed KIND:group / MEMBER instead). Membership is resolved client-side
-- by member UID, so the server only has to store the card faithfully and copy
-- it to every subscriber of the book, exactly like any other contact.
--
-- Two columns carry that:
--   kind          classifies the row so the web UI can keep group cards out of
--                 the people list, dedupe, and export.
--   group_members the member UIDs, mirrored out of the vCard so membership
--                 survives any path that regenerates vcard_data from columns
--                 rather than passing the stored card through verbatim.

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'individual',
  ADD COLUMN IF NOT EXISTS group_members JSONB;

-- Classify group cards that already synced in as ordinary contacts.
UPDATE contacts
SET kind = 'group'
WHERE kind <> 'group'
  AND vcard_data IS NOT NULL
  AND vcard_data ~* '(^|[\r\n])(X-ADDRESSBOOKSERVER-)?KIND:[[:space:]]*group';

-- Rather than re-parse members with a SQL regex (which would mishandle folded
-- lines), clear the inbound sync watermark on those rows so the next
-- Radicale -> DB pass re-reads each card with the real vCard parser and fills
-- group_members. The pass is a plain update, not a conflict: both the skip
-- check and the conflict check in radicale-to-db require a non-null
-- last_synced_from_radicale_at.
UPDATE contacts
SET last_synced_from_radicale_at = NULL,
    vcard_hash = NULL
WHERE kind = 'group';

CREATE INDEX IF NOT EXISTS idx_contacts_kind ON contacts (kind) WHERE deleted_at IS NULL;
