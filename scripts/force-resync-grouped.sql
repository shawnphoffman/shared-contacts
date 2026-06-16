-- force-resync-grouped.sql
--
-- One-time recovery for contacts whose iOS-grouped vCard properties (e.g.
-- "item1.ADR") were silently dropped on import before the vcard.ts parser was
-- fixed to strip the group prefix. The correct data still lives in each
-- contact's vcard_data (and in Radicale); only the structured columns are stale.
--
-- This does NOT edit any data itself. It clears vcard_hash for the affected
-- contacts so the sync service stops hash-skipping them (see
-- sync-service/src/sync/radicale-to-db.ts). The Radicale->DB direction is not
-- interval-polled: it runs from a file watcher (on vCard changes) and from the
-- one-shot sync at service startup. We aren't changing the vCard files, so after
-- clearing the hash you must RESTART the app container to trigger the startup
-- re-read; with vcard_hash NULL the fixed parser reprocesses the stored vCards,
-- repopulates addresses (and any other grouped field), and records a normal,
-- undoable history entry per contact that actually changed.
--
-- Sequence:
--   1. Deploy the fixed app image (NUC pulls :latest). The old parser must be
--      gone first, or the re-read drops the grouped properties again.
--   2. Run this file against Postgres (preview, then apply).
--   3. docker restart shared-contacts-app   (fires the startup Radicale->DB sync)
--
-- Run against the NUC's Postgres, e.g.:
--   docker exec -i shared-contacts-postgres psql -U <user> -d <db> -f - < scripts/force-resync-grouped.sql
-- or paste interactively:
--   docker exec -it shared-contacts-postgres psql -U <user> -d <db>

-- 1. DRY RUN: preview which contacts will be re-synced. Run this first.
SELECT id, full_name, addresses IS NULL AS addresses_missing
FROM contacts
WHERE addresses IS NULL
  AND vcard_data ~* 'item[0-9]+\.ADR';

-- 2. APPLY: clear the hash so the next sync pass re-imports them. The sync is
--    idempotent and history skips no-op updates, so this is safe to re-run.
UPDATE contacts
SET vcard_hash = NULL
WHERE addresses IS NULL
  AND vcard_data ~* 'item[0-9]+\.ADR';
