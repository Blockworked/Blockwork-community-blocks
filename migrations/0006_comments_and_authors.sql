-- Comments on a pack's page. A deleted one keeps its row so a thread still reads in order.
CREATE TABLE comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pack_id TEXT NOT NULL REFERENCES packs(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE INDEX comments_by_pack ON comments(pack_id, created_at);
CREATE INDEX comments_by_user ON comments(user_id, created_at);

-- Author pages are /authors/<public_id>, so links don't show provider account ids.
ALTER TABLE users ADD COLUMN public_id TEXT;
UPDATE users SET public_id = lower(hex(randomblob(6))) WHERE public_id IS NULL;
UPDATE users SET public_id = 'blockworked' WHERE id = 'blockwork:team';
CREATE UNIQUE INDEX users_by_public_id ON users(public_id);
