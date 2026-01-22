-- Address books and access control
CREATE TABLE IF NOT EXISTS address_books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  is_public BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Attach contacts to address books
CREATE TABLE IF NOT EXISTS contact_address_books (
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  address_book_id UUID NOT NULL REFERENCES address_books(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (contact_id, address_book_id)
);

CREATE INDEX IF NOT EXISTS idx_contact_address_books_book ON contact_address_books(address_book_id);

-- Assign address books to Radicale users (by username)
CREATE TABLE IF NOT EXISTS user_address_books (
  username TEXT NOT NULL,
  address_book_id UUID NOT NULL REFERENCES address_books(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (username, address_book_id)
);

CREATE INDEX IF NOT EXISTS idx_user_address_books_username ON user_address_books(username);

-- Keep updated_at current
DROP TRIGGER IF EXISTS update_address_books_updated_at ON address_books;
CREATE TRIGGER update_address_books_updated_at BEFORE UPDATE ON address_books
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed default shared book for backward compatibility
INSERT INTO address_books (name, slug, is_public)
VALUES ('Shared Contacts', 'shared-contacts', TRUE)
ON CONFLICT (slug) DO NOTHING;

-- Attach all existing contacts to the default shared book
INSERT INTO contact_address_books (contact_id, address_book_id)
SELECT c.id, ab.id
FROM contacts c
JOIN address_books ab ON ab.slug = 'shared-contacts'
ON CONFLICT DO NOTHING;
