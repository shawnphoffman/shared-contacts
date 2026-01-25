-- One read-only subscription user per address book (0 or 1).
-- Username is derived as ro-{address_book_id}; password stored as bcrypt hash.
CREATE TABLE IF NOT EXISTS address_book_readonly (
  address_book_id UUID NOT NULL PRIMARY KEY REFERENCES address_books(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS update_address_book_readonly_updated_at ON address_book_readonly;
CREATE TRIGGER update_address_book_readonly_updated_at BEFORE UPDATE ON address_book_readonly
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
