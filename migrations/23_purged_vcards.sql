-- Tombstones for permanently deleted cards.
--
-- Sync is bidirectional, and the inbound pass reads a card on disk with no row
-- behind it as a card a client just added. That is right for a new contact and
-- wrong for one that was purged: the row goes first, the vCards are cleared by
-- the outbound sweep afterwards, and anything reading disk in between puts the
-- contact straight back. It showed up as a contact returning from the dead
-- seconds after being emptied from the trash, and after any restart where the
-- purge happened while the sync service was down.
--
-- A row here says "this UID was deleted on purpose, do not recreate it". The
-- inbound pass drops the tombstone once the card is gone from disk, so the
-- table holds only in-flight deletions rather than growing forever.

CREATE TABLE IF NOT EXISTS purged_vcards (
  vcard_id TEXT PRIMARY KEY,
  purged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purged_vcards_purged_at ON purged_vcards(purged_at);
