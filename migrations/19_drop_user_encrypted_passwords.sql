-- Removes the encrypted-password store. The "view password" feature has been
-- removed: retrievable plaintext credentials are a security risk, and Radicale
-- auth relies only on the bcrypt htpasswd file. Dropping this table also clears
-- any previously stored, recoverable plaintext passwords at rest.

DROP TABLE IF EXISTS user_encrypted_passwords;
