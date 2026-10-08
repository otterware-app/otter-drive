CREATE TABLE otter_suite_session (session_id TEXT PRIMARY KEY REFERENCES session(id) ON DELETE CASCADE, accounts_token TEXT NOT NULL, expires_at INTEGER NOT NULL);
