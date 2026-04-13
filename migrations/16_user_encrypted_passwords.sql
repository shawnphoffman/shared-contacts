-- Stores AES-256-GCM encrypted plaintext passwords for Radicale users.
-- This allows admins to view / copy passwords from the UI, and lets
-- the system bake passwords into .mobileconfig downloads.
--
-- The encryption key is supplied via the PASSWORD_ENCRYPTION_KEY env var.
-- If the key is not set, no rows are written and the "view password"
-- feature is gracefully unavailable.

CREATE TABLE IF NOT EXISTS user_encrypted_passwords (
  username  TEXT PRIMARY KEY,
  encrypted TEXT NOT NULL,       -- base64(iv + ciphertext + authTag)
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
