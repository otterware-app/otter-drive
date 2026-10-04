import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { Database } from './test-database'
import {
  createFolder,
  folderAccess,
  driveMembers,
  listFolders,
  updateFolder,
  deleteFolder,
  transferDrive,
} from './folders'
import { authenticate, assertCanWrite } from './actor'
import { createAuth } from './auth'
import { createArtifact } from './artifacts'
import { signContentGrant, startContentSession } from './content'
import type { Env, AuthenticatedActor } from './types'
vi.mock('cloudflare:workers', () => ({ waitUntil: vi.fn() }))
let db: Database, env: Env
const owner: AuthenticatedActor = {
  type: 'user',
  id: 'owner',
  name: 'Owner',
  userId: 'owner',
  ownerUserId: 'owner',
  folderId: 'private',
  roles: ['owner'],
  permissions: {},
}
beforeEach(() => {
  db = new Database()
  env = {
    DB: db as unknown as D1Database,
    APP_URL: 'http://drive.test',
    CONTENT_URL: 'http://content.test',
    CONTENT_SIGNING_KEY: 'testing-content-signing-key-thirty-two-characters',
    BETTER_AUTH_SECRET: 'test-secret-at-least-thirty-two-characters',
    OTTER_AUTH_URL: 'http://issuer.test/v1/auth',
  } as Env
  for (const id of ['owner', 'editor', 'viewer', 'stranger'])
    db.sqlite
      .prepare(
        'INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)',
      )
      .run(id, id, `${id}@example.com`, '2026-01-01', '2026-01-01')
  db.sqlite.exec(
    "INSERT INTO folder VALUES('private','My Drive','private','owner',NULL,'personal','2026-01-01','2026-01-01')",
  )
})
afterEach(() => db.sqlite.close())
const request = (body: object, method: 'POST' | 'PATCH' = 'POST') =>
  new Request('http://drive.test/api/v1/folders', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
async function create(name: string, parentId?: string) {
  return (
    (await (
      await createFolder(
        request({ name, ...(parentId ? { parentId } : { kind: 'shared' }) }),
        env,
        owner,
      )
    ).json()) as { data: { id: string; slug: string } }
  ).data
}
async function asUser(userId: string, folderId: string) {
  const access = await folderAccess(env, userId, folderId)
  return {
    ...owner,
    id: userId,
    userId,
    folderId,
    roles: [access.role],
    ownerUserId: access.ownerUserId,
  }
}
describe('personal and shared drives', () => {
  it('inherits view/edit access through recursive folders and revokes it for browser and CLI immediately', async () => {
    const shared = await create('Zentio'),
      child = await create('Project', shared.id),
      grandchild = await create('Design', child.id)
    await driveMembers(
      request({ email: 'editor@example.com', role: 'editor' }),
      env,
      owner,
      shared.id,
    )
    await driveMembers(
      request({ email: 'viewer@example.com', role: 'viewer' }),
      env,
      owner,
      shared.id,
    )
    expect((await folderAccess(env, 'editor', grandchild.id)).role).toBe(
      'editor',
    )
    expect(() => assertCanWrite({ ...owner, roles: ['viewer'] })).toThrow(
      'edit access',
    )
    const editor = await asUser('editor', grandchild.id)
    const artifact = (await (
      await createArtifact(
        request({ slug: 'report', title: 'Report' }),
        env,
        editor,
      )
    ).json()) as { data: { id: string } }
    expect(
      db.sqlite
        .prepare('SELECT owner_user_id FROM artifact WHERE id=?')
        .get(artifact.data.id)?.owner_user_id,
    ).toBe('owner')
    await expect(folderAccess(env, 'editor', 'private')).rejects.toThrow(
      'Folder not found',
    )
    await expect(folderAccess(env, 'stranger', grandchild.id)).rejects.toThrow(
      'Folder not found',
    )
    const member = db.sqlite
      .prepare("SELECT id FROM drive_member WHERE email='editor@example.com'")
      .get()!
    await driveMembers(
      new Request('http://drive.test', { method: 'DELETE' }),
      env,
      owner,
      shared.id,
      String(member.id),
    )
    await expect(folderAccess(env, 'editor', grandchild.id)).rejects.toThrow(
      'Folder not found',
    )
    const lists = (await (
      await listFolders(env, { ...owner, userId: 'editor' })
    ).json()) as { data: unknown[] }
    expect(lists.data).toHaveLength(0)
  })
  it('revokes previously issued document preview grants when membership is removed', async () => {
    const drive = await create('Shared'),
      child = await create('Nested', drive.id)
    await driveMembers(
      request({ email: 'viewer@example.com', role: 'viewer' }),
      env,
      owner,
      drive.id,
    )
    const artifact = (await (
      await createArtifact(
        request({ slug: 'report', title: 'Report' }),
        env,
        await asUser('owner', child.id),
      )
    ).json()) as { data: { id: string } }
    const token = await signContentGrant(env, {
      artifactId: artifact.data.id,
      versionId: 'version',
      entryPath: 'index.html',
      principal: { userId: 'viewer' },
    })
    const req = new Request(`http://content.test/raw/session/${token}`)
    expect((await startContentSession(req, env, token)).status).toBe(302)
    db.sqlite.exec('DELETE FROM drive_member')
    await expect(startContentSession(req, env, token)).rejects.toThrow(
      'Document access was removed',
    )
  })
  it('keeps drive-scoped API keys inside their subtree and blocks self-containment', async () => {
    const drive = await create('Shared'),
      child = await create('Child', drive.id),
      grandchild = await create('Grandchild', child.id),
      other = await create('Other')
    expect(
      (await folderAccess(env, 'owner', grandchild.id, drive.id)).role,
    ).toBe('owner')
    await expect(
      folderAccess(env, 'owner', other.id, drive.id),
    ).rejects.toThrow()
    await expect(
      updateFolder(
        request({ parentId: grandchild.id }, 'PATCH'),
        env,
        owner,
        child.id,
      ),
    ).rejects.toThrow('cannot contain itself')
    await expect(
      updateFolder(
        request({ parentId: other.id }, 'PATCH'),
        env,
        owner,
        child.id,
      ),
    ).rejects.toThrow('same drive')
    await expect(deleteFolder(env, owner, drive.id)).rejects.toThrow('empty')
    await deleteFolder(env, owner, grandchild.id)
    await deleteFolder(env, owner, child.id)
    await deleteFolder(env, owner, drive.id)
  })
  it('rejects one of two concurrent moves that would form a cycle', async () => {
    const drive = await create('Shared'),
      a = await create('A', drive.id),
      b = await create('B', drive.id)
    const results = await Promise.allSettled([
      updateFolder(request({ parentId: b.id }, 'PATCH'), env, owner, a.id),
      updateFolder(request({ parentId: a.id }, 'PATCH'), env, owner, b.id),
    ])
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1)
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1)
    expect((await folderAccess(env, 'owner', a.id)).driveId).toBe(drive.id)
    expect((await folderAccess(env, 'owner', b.id)).driveId).toBe(drive.id)
  })
  it('only permits shared drive owners to invite; personal folders cannot be shared', async () => {
    const drive = await create('Shared')
    await driveMembers(
      request({ email: 'editor@example.com', role: 'editor' }),
      env,
      owner,
      drive.id,
    )
    await expect(
      driveMembers(
        request({ email: 'stranger@example.com', role: 'editor' }),
        env,
        await asUser('editor', drive.id),
        drive.id,
      ),
    ).rejects.toThrow('Only the shared drive owner')
    await expect(
      driveMembers(
        request({ email: 'stranger@example.com', role: 'viewer' }),
        env,
        owner,
        'private',
      ),
    ).rejects.toThrow('Only the shared drive owner')
  })
  it('transfers a shared drive and all descendants while keeping the former owner as an editor', async () => {
    const shared = await create('Shared'),
      child = await create('Nested', shared.id)
    await driveMembers(
      request({ email: 'editor@example.com', role: 'editor' }),
      env,
      owner,
      shared.id,
    )
    const artifact = (await (
      await createArtifact(
        request({ slug: 'report', title: 'Report' }),
        env,
        await asUser('owner', child.id),
      )
    ).json()) as { data: { id: string } }
    await transferDrive(request({ userId: 'editor' }), env, owner, shared.id)
    expect((await folderAccess(env, 'editor', child.id)).role).toBe('owner')
    expect((await folderAccess(env, 'owner', child.id)).role).toBe('editor')
    expect(
      db.sqlite
        .prepare('SELECT owner_user_id FROM artifact WHERE id=?')
        .get(artifact.data.id)?.owner_user_id,
    ).toBe('editor')
    expect(db.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })
  it('honors a revoked membership with an otherwise valid bearer session', async () => {
    const drive = await create('Shared'),
      child = await create('Nested', drive.id)
    await driveMembers(
      request({ email: 'editor@example.com', role: 'editor' }),
      env,
      owner,
      drive.id,
    )
    const auth = createAuth(env)
    db.sqlite
      .prepare(
        'INSERT INTO session(id,userId,token,expiresAt,createdAt,updatedAt) VALUES(?,?,?,?,?,?)',
      )
      .run(
        's',
        'editor',
        'sessiontoken',
        new Date(Date.now() + 60000).toISOString(),
        new Date().toISOString(),
        new Date().toISOString(),
      )
    const req = new Request('http://drive.test/api/v1/me', {
      headers: {
        authorization: 'Bearer sessiontoken',
        'x-otterdrive-folder': child.id,
      },
    })
    expect((await authenticate(req, env, auth)).roles).toEqual(['editor'])
    db.sqlite.exec('DELETE FROM drive_member')
    await expect(authenticate(req, env, auth)).rejects.toThrow(
      'Folder not found',
    )
  })
})
