ALTER TABLE session ADD COLUMN otterSessionId TEXT;
CREATE INDEX session_otterSessionId_idx ON session (otterSessionId);

-- Retain a tombstone so deletion retries cannot affect another identity.
CREATE TABLE otter_identity_deleted (
  subject TEXT PRIMARY KEY NOT NULL,
  deletedAt TEXT NOT NULL
);

CREATE TABLE otter_logout_token (
  id TEXT PRIMARY KEY NOT NULL,
  expiresAt INTEGER NOT NULL
);
