-- Accounts come from OAuth; id is "<provider>:<provider user id>".
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  avatar TEXT NOT NULL DEFAULT '',
  banned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- Only a hash of the cookie token is stored.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL
);

-- A pack id belongs to whoever first submitted it, so nobody else can push updates to it.
CREATE TABLE packs (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  listed INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

-- Every upload; the index lists each listed pack's newest approved one.
CREATE TABLE versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pack_id TEXT NOT NULL REFERENCES packs(id),
  sha256 TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  version TEXT NOT NULL,
  blocks TEXT NOT NULL,
  capabilities TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  reason TEXT NOT NULL DEFAULT '',
  submitted_by TEXT NOT NULL REFERENCES users(id),
  submitted_at INTEGER NOT NULL,
  reviewed_at INTEGER
);

CREATE INDEX versions_by_pack ON versions(pack_id, status);
CREATE INDEX versions_by_submitter ON versions(submitted_by, submitted_at);
CREATE INDEX sessions_by_user ON sessions(user_id);
