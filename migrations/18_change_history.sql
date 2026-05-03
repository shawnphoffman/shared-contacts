-- Track who made what changes to contacts, when, how, and what the previous
-- state was so changes can be undone.
--
-- Operations: create | update | delete | restore | permanent_delete | merge |
--             unmerge | import | undo
-- Sources:    web | api | carddav | sync | import | merge | dedup | system
--
-- previous_state and new_state hold full sanitized contact snapshots (no
-- photo_blob — too large) so an undo can rehydrate the prior values without
-- relying on cross-row joins. related_contact_ids carries the consumed
-- contacts on a merge so unmerge can restore them.

CREATE TABLE IF NOT EXISTS contact_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID,
  operation TEXT NOT NULL,
  source TEXT NOT NULL,
  actor TEXT,
  actor_type TEXT,
  user_agent TEXT,
  client_ip TEXT,
  summary TEXT,
  changed_fields TEXT[],
  previous_state JSONB,
  new_state JSONB,
  related_contact_ids UUID[],
  metadata JSONB,
  undone_at TIMESTAMPTZ,
  undone_by_history_id UUID REFERENCES contact_history(id) ON DELETE SET NULL,
  undoes_history_id UUID REFERENCES contact_history(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_history_contact_id ON contact_history(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_history_created_at ON contact_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_history_operation ON contact_history(operation);
CREATE INDEX IF NOT EXISTS idx_contact_history_source ON contact_history(source);
CREATE INDEX IF NOT EXISTS idx_contact_history_actor ON contact_history(actor);
