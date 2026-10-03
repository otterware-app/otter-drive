-- Preserve the existing namespaces and URLs as folders. Every resource is
-- owned by one person; sharing never grants account-wide membership.
CREATE TABLE folder (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  owner_user_id TEXT NOT NULL REFERENCES user(id),
  parent_id TEXT REFERENCES folder(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('personal','shared','folder')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((kind='folder' AND parent_id IS NOT NULL) OR (kind!='folder' AND parent_id IS NULL))
);
CREATE INDEX folder_parent_idx ON folder(parent_id);
CREATE INDEX folder_owner_idx ON folder(owner_user_id);
CREATE UNIQUE INDEX folder_personal_owner_idx ON folder(owner_user_id) WHERE kind='personal';
CREATE TABLE drive_member (
  id TEXT PRIMARY KEY NOT NULL,
  drive_id TEXT NOT NULL REFERENCES folder(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  user_id TEXT REFERENCES user(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('viewer','editor')),
  created_at TEXT NOT NULL,
  UNIQUE(drive_id,email)
);
CREATE INDEX drive_member_user_idx ON drive_member(user_id,drive_id);
-- A missing owner must fail the migration rather than silently lose data.
INSERT INTO folder(id,name,slug,owner_user_id,parent_id,kind,created_at,updated_at)
 SELECT o.id,o.name,o.slug,
   (SELECT m.userId FROM member m WHERE m.organizationId=o.id AND instr(','||replace(m.role,' ','')||',',',owner,')>0 ORDER BY m.createdAt LIMIT 1),
   NULL, CASE WHEN o.slug='chris' THEN 'personal' ELSE 'shared' END,
   o.createdAt,o.createdAt FROM organization o;
INSERT INTO folder(id,name,slug,owner_user_id,parent_id,kind,created_at,updated_at)
 SELECT 'home_' || u.id,'My Drive','home-' || u.id,u.id,NULL,'personal',u.createdAt,u.updatedAt
 FROM user u WHERE NOT EXISTS(SELECT 1 FROM folder f WHERE f.owner_user_id=u.id AND f.kind='personal');
INSERT INTO drive_member(id,drive_id,email,user_id,role,created_at)
 SELECT m.id,m.organizationId,lower(u.email),m.userId,
 CASE WHEN m.role='viewer' THEN 'viewer' ELSE 'editor' END,m.createdAt
 FROM member m JOIN user u ON u.id=m.userId JOIN folder f ON f.id=m.organizationId
 WHERE m.userId!=f.owner_user_id AND f.kind='shared';
INSERT OR IGNORE INTO drive_member(id,drive_id,email,user_id,role,created_at)
 SELECT i.id,i.organizationId,lower(i.email),NULL,
 CASE WHEN i.role='viewer' THEN 'viewer' ELSE 'editor' END,i.createdAt
 FROM invitation i JOIN folder f ON f.id=i.organizationId
 WHERE f.kind='shared' AND i.status='pending' AND i.expiresAt > strftime('%Y-%m-%dT%H:%M:%fZ','now');
UPDATE artifact SET owner_user_id=(SELECT owner_user_id FROM folder WHERE id=artifact.organization_id);
-- Keep old keys restricted to their former organization's folder subtree.
UPDATE apikey SET metadata=json_set(COALESCE(metadata,'{}'),'$.folderId',referenceId),
 referenceId=(SELECT owner_user_id FROM folder WHERE id=apikey.referenceId),configId='user'
 WHERE configId='organization';
ALTER TABLE artifact RENAME COLUMN organization_id TO folder_id;
ALTER TABLE artifact_upload RENAME COLUMN organization_id TO folder_id;
ALTER TABLE audit_event RENAME COLUMN organization_id TO folder_id;
ALTER TABLE session DROP COLUMN activeOrganizationId;
DROP TABLE invitation;
DROP TABLE member;
DROP TABLE organization;

