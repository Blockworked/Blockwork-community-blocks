-- Blockwork signs in through the browser and gets a token of its own: a
-- session row of kind 'app', sent as a bearer token instead of a cookie.
ALTER TABLE sessions ADD COLUMN kind TEXT NOT NULL DEFAULT 'web';
ALTER TABLE sessions ADD COLUMN label TEXT NOT NULL DEFAULT '';
ALTER TABLE sessions ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;

-- One-time codes the browser hands the app's loopback address, swapped for a
-- token with the verifier whose SHA-256 is the challenge (PKCE).
CREATE TABLE app_codes (
  code_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  challenge TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  expires_at INTEGER NOT NULL
);
