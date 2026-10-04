import { afterEach, expect, it } from 'vitest'
import { Database } from './test-database'
import { identityMigration } from './identity-migration'
let db: Database | undefined
afterEach(() => db?.sqlite.close())
it('transfers the existing identity and all ownership without changing document links, sessions or key hashes', () => {
  db = new Database((sqlite, file) => {
    if (file !== '0005_otter_identity.sql') return
    sqlite.exec(`
 INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES('old-drive','Owner','owner@example.com',1,'2026-01-01','2026-01-01');
 INSERT INTO session(id,userId,token,expiresAt,createdAt,updatedAt,impersonatedBy) VALUES('s','old-drive','keep-token','2099-01-01','2026-01-01','2026-01-01','old-drive');
 INSERT INTO account(id,accountId,providerId,userId,password,createdAt,updatedAt) VALUES('password','old-drive','credential','old-drive','old-hash','2026-01-01','2026-01-01');
 INSERT INTO organization(id,name,slug,createdAt) VALUES('chris','chris','chris','2026-01-01'),('zentio','zentio','zentio','2026-01-01');
 INSERT INTO member(id,organizationId,userId,role,createdAt) VALUES('m1','chris','old-drive','owner','2026-01-01'),('m2','zentio','old-drive','owner','2026-01-01');
 INSERT INTO apikey(id,configId,referenceId,key,enabled,createdAt,updatedAt,permissions) VALUES('k','organization','zentio','keep-hash',1,'2026-01-01','2026-01-01','{"artifact":["read","create","update"]}');
 INSERT INTO artifact(id,organization_id,owner_user_id,created_by_actor_type,created_by_actor_id,slug,title,state,created_at,updated_at) VALUES('a','zentio',NULL,'user','old-drive','report','Report','published','2026-01-01','2026-01-01');
 INSERT INTO artifact_version(id,artifact_id,number,label,entry_path,created_at,created_by_user_id,file_count,byte_size,content_hash) VALUES('v','a',1,'Initial','index.html','2026-01-01','old-drive',1,1,'hash');
 INSERT INTO artifact_file VALUES('v','index.html','text/html',1,'hash','unchanged/r2-key');
 INSERT INTO artifact_upload(id,artifact_id,organization_id,actor_type,actor_id,actor_name,version_id,version_number,label,entry_path,manifest_json,state,created_at,expires_at) VALUES('upload','a','zentio','user','old-drive','Owner','v',1,'Initial','index.html','[]','complete','2026-01-01','2099-01-01');
 INSERT INTO audit_event(id,organization_id,actor_type,actor_id,actor_name,action,resource_type,resource_id,created_at) VALUES('audit','zentio','user','old-drive','Owner','created','artifact','a','2026-01-01');
 INSERT INTO deviceCode(id,deviceCode,userCode,userId,expiresAt,status) VALUES('device','device-token','user-code','old-drive','2099-01-01','approved');
 `)
  })
  db.exec('BEGIN')
  db.exec(identityMigration('old-drive', 'mail-subject', 'link', '2026-01-02'))
  db.exec('COMMIT')
  const first = (sql: string) => db!.sqlite.prepare(sql).get()
  expect(first('SELECT id FROM user')?.id).toBe('mail-subject')
  expect(first('SELECT userId,token FROM session')).toMatchObject({
    userId: 'mail-subject',
    token: 'keep-token',
  })
  expect(first('SELECT providerId,accountId FROM account')).toMatchObject({
    providerId: 'otter',
    accountId: 'mail-subject',
  })
  expect(
    db.sqlite.prepare('SELECT name,kind FROM folder ORDER BY name').all(),
  ).toEqual([
    // 0007 names every personal drive "My Drive", as Google Drive does.
    { name: 'My Drive', kind: 'personal' },
    { name: 'zentio', kind: 'shared' },
  ])
  expect(
    first('SELECT referenceId,key,metadata,configId FROM apikey'),
  ).toMatchObject({
    referenceId: 'mail-subject',
    key: 'keep-hash',
    metadata: '{"folderId":"zentio"}',
    configId: 'user',
  })
  expect(
    first(
      'SELECT owner_user_id,created_by_actor_id,folder_id,slug FROM artifact',
    ),
  ).toMatchObject({
    owner_user_id: 'mail-subject',
    created_by_actor_id: 'mail-subject',
    folder_id: 'zentio',
    slug: 'report',
  })
  expect(first('SELECT r2_key FROM artifact_file')?.r2_key).toBe(
    'unchanged/r2-key',
  )
  for (const [table, col] of [
    ['artifact_version', 'created_by_user_id'],
    ['artifact_upload', 'actor_id'],
    ['audit_event', 'actor_id'],
    ['deviceCode', 'userId'],
    ['session', 'impersonatedBy'],
  ])
    expect(first(`SELECT ${col} AS id FROM ${table}`)?.id).toBe('mail-subject')
  expect(db.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  db.exec('BEGIN')
  db.exec(
    identityMigration('mail-subject', 'mail-subject', 'unused', '2026-01-03'),
  )
  db.exec('COMMIT')
  expect(first('SELECT count(*) AS n FROM account')?.n).toBe(1)
})
