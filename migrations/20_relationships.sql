-- Relationship graph between people. One canonical edge per fact; every view
-- (contact tab, book tri-pane) is a projection of this graph.
--
-- Endpoints are polymorphic: each side is either a real contact or a
-- "placeholder" person (someone worth a tree node but not a contact, e.g. a
-- deceased grandparent). Exactly one of the two id columns per side is set.
--
-- Direction rules (enforced in app code, ui/src/lib/relationships.ts):
--   parent            directional: A is the parent of B
--   spouse | partner | sibling   symmetric: stored once with endpoints in
--                     canonical order (contact endpoints before placeholder
--                     endpoints, then ascending UUID) so duplicates collide
--                     on the unique index.
--
-- qualifier refines a type (parent: biological | step | adoptive;
-- spouse: ex). type/qualifier are unconstrained TEXT so future non-family
-- types don't need a migration.
--
-- Relationships are deliberately DB/UI-only: they are never serialized into
-- vcard_data, so the CardDAV sync pipeline is untouched by design.

CREATE TABLE IF NOT EXISTS relationship_placeholders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  birth_year INTEGER,
  death_year INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contact_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  a_contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  a_placeholder_id UUID REFERENCES relationship_placeholders(id) ON DELETE CASCADE,
  b_contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  b_placeholder_id UUID REFERENCES relationship_placeholders(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  qualifier TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_rel_a_endpoint CHECK (num_nonnulls(a_contact_id, a_placeholder_id) = 1),
  CONSTRAINT chk_rel_b_endpoint CHECK (num_nonnulls(b_contact_id, b_placeholder_id) = 1),
  CONSTRAINT chk_rel_no_self_contact CHECK (a_contact_id IS NULL OR a_contact_id IS DISTINCT FROM b_contact_id),
  CONSTRAINT chk_rel_no_self_placeholder CHECK (a_placeholder_id IS NULL OR a_placeholder_id IS DISTINCT FROM b_placeholder_id)
);

-- NULLS NOT DISTINCT (PG15+) makes the polymorphic endpoint columns collide on
-- duplicates even though two of the five columns are always NULL.
CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_relationships_unique
  ON contact_relationships (a_contact_id, a_placeholder_id, b_contact_id, b_placeholder_id, type)
  NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS idx_contact_relationships_a_contact ON contact_relationships(a_contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_relationships_b_contact ON contact_relationships(b_contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_relationships_a_placeholder ON contact_relationships(a_placeholder_id);
CREATE INDEX IF NOT EXISTS idx_contact_relationships_b_placeholder ON contact_relationships(b_placeholder_id);
