-- Google Drive's model: your personal drive is "My Drive", never a name.
UPDATE folder SET name = 'My Drive' WHERE kind = 'personal';

-- "Anyone with the link": opening the link adds the person to the resource
-- (a share row pointing back here), so turning the link off removes them.
CREATE TABLE share_link (
  id TEXT PRIMARY KEY NOT NULL,
  folder_id TEXT REFERENCES folder(id) ON DELETE CASCADE,
  artifact_id TEXT REFERENCES artifact(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('viewer', 'editor')),
  created_by_user_id TEXT REFERENCES user(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  CHECK ((folder_id IS NULL) != (artifact_id IS NULL))
);
CREATE UNIQUE INDEX share_link_folder_idx ON share_link(folder_id)
  WHERE folder_id IS NOT NULL;
CREATE UNIQUE INDEX share_link_artifact_idx ON share_link(artifact_id)
  WHERE artifact_id IS NOT NULL;

-- A folder (and everything inside it) or one document shared with a person,
-- without making them a member of its drive. Like drive members, a share
-- names an email and resolves to the user once they sign in.
CREATE TABLE share (
  id TEXT PRIMARY KEY NOT NULL,
  folder_id TEXT REFERENCES folder(id) ON DELETE CASCADE,
  artifact_id TEXT REFERENCES artifact(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  user_id TEXT REFERENCES user(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('viewer', 'editor')),
  link_id TEXT REFERENCES share_link(id) ON DELETE CASCADE,
  created_by_user_id TEXT REFERENCES user(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((folder_id IS NULL) != (artifact_id IS NULL))
);
CREATE UNIQUE INDEX share_folder_email_idx ON share(folder_id, email)
  WHERE folder_id IS NOT NULL;
CREATE UNIQUE INDEX share_artifact_email_idx ON share(artifact_id, email)
  WHERE artifact_id IS NOT NULL;
CREATE INDEX share_user_idx ON share(user_id);
CREATE INDEX share_email_idx ON share(email);
CREATE INDEX share_link_id_idx ON share(link_id);

-- Counting the share emails each person sent today.
CREATE INDEX audit_event_actor_action_idx
  ON audit_event (actor_id, action, created_at);
