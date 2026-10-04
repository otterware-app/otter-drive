import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Sharing } from '@otterware/contracts'
import { Database } from './test-database'
import { authenticate } from './actor'
import {
  archiveArtifact,
  listArtifacts,
  moveArtifact,
  permanentlyDeleteArtifact,
  showArtifact,
  updateArtifact,
} from './artifacts'
import { createAuth } from './auth'
import { signContentGrant, startContentSession } from './content'
import {
  createFolder,
  ensurePersonalDrive,
  folderAccess,
  listFolders,
  updateFolder,
} from './folders'
import {
  acceptLink,
  artifactSharing,
  folderSharing,
  sharedWithMe,
  suggestPeople,
} from './sharing'
import type { AuthenticatedActor, Env } from './types'

vi.mock('cloudflare:workers', () => ({ waitUntil: vi.fn() }))

let db: Database, env: Env

function actor(userId: string, folderId = `home_${userId}`, roles = ['owner']) {
  return {
    type: 'user',
    id: userId,
    name: userId,
    userId,
    folderId,
    roles,
    permissions: {},
  } satisfies AuthenticatedActor
}
/** The actor for a request that names `folderId`, as `authenticate` builds it. */
async function inFolder(userId: string, folderId: string) {
  const access = await folderAccess(env, userId, folderId)
  return {
    ...actor(userId, folderId, [access.role]),
    ownerUserId: access.ownerUserId,
  }
}
const owner = actor('owner')

function body(value: object, method: 'POST' | 'PATCH' | 'PUT' = 'POST') {
  return new Request('http://drive.test/api/v1/x', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(value),
  })
}
const get = () => new Request('http://drive.test/api/v1/x')
const del = () =>
  new Request('http://drive.test/api/v1/x', { method: 'DELETE' })

async function data<T = Sharing>(response: Response | Promise<Response>) {
  return ((await (await response).json()) as { data: T }).data
}

async function folder(name: string, parentId?: string) {
  return data<{ id: string }>(
    createFolder(
      body(parentId ? { name, parentId } : { name, kind: 'shared' }),
      env,
      owner,
    ),
  )
}

function publish(id: string, folderId: string, title = id) {
  db.sqlite
    .prepare(
      `INSERT INTO artifact(id,folder_id,owner_user_id,created_by_actor_type,created_by_actor_id,slug,title,state,created_at,updated_at)
       VALUES(?,?,'owner','user','owner',?,?,'published','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')`,
    )
    .run(id, folderId, id, title)
  return id
}

beforeEach(async () => {
  db = new Database()
  env = {
    DB: db as unknown as D1Database,
    APP_URL: 'http://drive.test',
    CONTENT_URL: 'http://content.test',
    CONTENT_SIGNING_KEY: 'testing-content-signing-key-thirty-two-characters',
    BETTER_AUTH_SECRET: 'test-secret-at-least-thirty-two-characters',
    OTTER_AUTH_URL: 'http://issuer.test/v1/auth',
  } as Env
  for (const id of ['owner', 'alex', 'sam', 'stranger']) {
    db.sqlite
      .prepare(
        'INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)',
      )
      .run(id, `${id} name`, `${id}@example.com`, '2026-01-01', '2026-01-01')
    await ensurePersonalDrive(env, id)
  }
})
afterEach(() => db.sqlite.close())

describe('sharing folders', () => {
  it('shares a folder and everything inside it without drive membership', async () => {
    const projects = await folder('Projects', 'home_owner')
    const design = await folder('Design', projects.id)
    publish('spec', design.id)
    const sharing = await data(
      folderSharing(
        body({ emails: ['Alex@Example.com'], role: 'viewer' }),
        env,
        owner,
        projects.id,
        ['people'],
      ),
    )
    expect(sharing.people).toMatchObject([
      { email: 'alex@example.com', userId: 'alex', role: 'viewer' },
    ])

    // The folder and its subfolders, but never the drive above them.
    expect((await folderAccess(env, 'alex', design.id)).role).toBe('viewer')
    expect((await folderAccess(env, 'alex', design.id)).member).toBe(false)
    await expect(folderAccess(env, 'alex', 'home_owner')).rejects.toThrow()
    const folders = await data<Array<{ id: string; role: string }>>(
      listFolders(env, actor('alex')),
    )
    expect(folders.map((item) => [item.id, item.role])).toEqual(
      expect.arrayContaining([
        [projects.id, 'viewer'],
        [design.id, 'viewer'],
      ]),
    )
    expect(folders.some((item) => item.id === 'home_owner')).toBe(false)

    // Documents inside it list and open as a viewer, read-only.
    const alex = await inFolder('alex', design.id)
    const listed = await data<Array<{ id: string; role: string }>>(
      listArtifacts(
        new Request('http://drive.test/api/v1/artifacts'),
        env,
        alex,
      ),
    )
    expect(listed).toMatchObject([{ id: 'spec', role: 'viewer' }])
    await expect(archiveArtifact(env, alex, 'spec')).rejects.toThrow(
      'edit access',
    )

    // The descendant shows the inherited access in its own dialog.
    const inner = await data(folderSharing(get(), env, owner, design.id, []))
    expect(inner.people).toMatchObject([
      {
        email: 'alex@example.com',
        inheritedFrom: { id: projects.id, name: 'Projects' },
      },
    ])

    // Revoking the folder share ends access everywhere below it.
    await folderSharing(del(), env, owner, projects.id, [
      'people',
      sharing.people[0]!.id,
    ])
    await expect(folderAccess(env, 'alex', design.id)).rejects.toThrow(
      'Folder not found',
    )
  })

  it('lets editors share, add folders and rename them, but not viewers', async () => {
    const projects = await folder('Projects', 'home_owner')
    await folderSharing(
      body({ emails: ['alex@example.com'], role: 'editor' }),
      env,
      owner,
      projects.id,
      ['people'],
    )
    await folderSharing(
      body({ emails: ['sam@example.com'], role: 'viewer' }),
      env,
      actor('alex'),
      projects.id,
      ['people'],
    )
    await expect(
      folderSharing(
        body({ emails: ['stranger@example.com'], role: 'viewer' }),
        env,
        actor('sam'),
        projects.id,
        ['people'],
      ),
    ).rejects.toThrow('edit access to share')
    const child = await data<{ id: string; role: string }>(
      createFolder(
        body({ name: 'Alex notes', parentId: projects.id }),
        env,
        actor('alex'),
      ),
    )
    expect(child.role).toBe('editor')
    await updateFolder(
      body({ name: 'Notes' }, 'PATCH'),
      env,
      actor('alex'),
      child.id,
    )
    await expect(
      updateFolder(
        body({ parentId: 'home_owner' }, 'PATCH'),
        env,
        actor('alex'),
        child.id,
      ),
    ).rejects.toThrow('Only the drive owner')
  })

  it('keeps the personal drive private and named My Drive', async () => {
    await expect(
      folderSharing(
        body({ emails: ['alex@example.com'], role: 'viewer' }),
        env,
        owner,
        'home_owner',
        ['people'],
      ),
    ).rejects.toThrow('personal drive is private')
    await expect(
      updateFolder(body({ name: 'chris' }, 'PATCH'), env, owner, 'home_owner'),
    ).rejects.toThrow('always called My Drive')
    const sharing = await data(
      folderSharing(get(), env, owner, 'home_owner', []),
    )
    expect(sharing).toMatchObject({
      resource: { name: 'My Drive', folderKind: 'personal' },
      drive: { kind: 'personal', memberCount: 1 },
      canShare: false,
    })
  })

  it('manages a shared drive’s members from its own sharing, owner only', async () => {
    const zentio = await folder('Zentio')
    const sharing = await data(
      folderSharing(
        body({
          emails: ['alex@example.com', 'new@example.com'],
          role: 'editor',
        }),
        env,
        owner,
        zentio.id,
        ['people'],
      ),
    )
    expect(sharing.drive).toMatchObject({ kind: 'shared', memberCount: 3 })
    expect(sharing.people.map((entry) => [entry.email, entry.userId])).toEqual([
      ['alex@example.com', 'alex'],
      ['new@example.com', null],
    ])
    expect((await folderAccess(env, 'alex', zentio.id)).member).toBe(true)
    await expect(
      folderSharing(
        body({ emails: ['sam@example.com'], role: 'viewer' }),
        env,
        actor('alex'),
        zentio.id,
        ['people'],
      ),
    ).rejects.toThrow('Only the shared drive owner')
    await expect(
      folderSharing(body({ role: 'viewer' }, 'PUT'), env, owner, zentio.id, [
        'link',
      ]),
    ).rejects.toThrow('Share a drive by adding members')
  })

  it('refuses to add the owner', async () => {
    const projects = await folder('Projects', 'home_owner')
    await expect(
      folderSharing(
        body({ emails: ['owner@example.com'], role: 'viewer' }),
        env,
        actor('owner'),
        projects.id,
        ['people'],
      ),
    ).rejects.toThrow('owns this already')
  })
})

describe('sharing documents', () => {
  it('opens a document shared on its own by id, and only that document', async () => {
    const projects = await folder('Projects', 'home_owner')
    publish('report', projects.id, 'Report')
    publish('secret', projects.id, 'Secret')
    await artifactSharing(
      body({ emails: ['alex@example.com'], role: 'viewer' }),
      env,
      await inFolder('owner', projects.id),
      'report',
      ['people'],
    )
    // Alex's request names Alex's own drive, as a link to the document does.
    const alex = actor('alex')
    const report = await data<{ role: string; shared: boolean }>(
      showArtifact(env, alex, 'report'),
    )
    expect(report).toMatchObject({ role: 'viewer', shared: true })
    await expect(showArtifact(env, alex, 'secret')).rejects.toThrow(
      'Document not found',
    )
    await expect(folderAccess(env, 'alex', projects.id)).rejects.toThrow()

    // Owning your own drive grants nothing on someone else's document.
    await expect(
      updateArtifact(body({ title: 'Mine' }, 'PATCH'), env, alex, 'report'),
    ).rejects.toThrow('edit access')
    await expect(archiveArtifact(env, alex, 'report')).rejects.toThrow(
      'edit access',
    )
    await expect(
      permanentlyDeleteArtifact(env, alex, 'report'),
    ).rejects.toThrow()
    await expect(
      moveArtifact(body({ folderId: 'home_alex' }), env, alex, 'report'),
    ).rejects.toThrow('Only drive owners')
  })

  it('lets a document editor edit it, and no more', async () => {
    const projects = await folder('Projects', 'home_owner')
    publish('report', projects.id, 'Report')
    await artifactSharing(
      body({ emails: ['alex@example.com'], role: 'editor' }),
      env,
      await inFolder('owner', projects.id),
      'report',
      ['people'],
    )
    const alex = actor('alex')
    const updated = await data<{ title: string; role: string }>(
      updateArtifact(
        body({ title: 'Report v2' }, 'PATCH'),
        env,
        alex,
        'report',
      ),
    )
    expect(updated).toMatchObject({ title: 'Report v2', role: 'editor' })
    await archiveArtifact(env, alex, 'report')
    await expect(
      permanentlyDeleteArtifact(env, alex, 'report'),
    ).rejects.toThrow('Only the drive owner')
  })

  it('raises a drive viewer to editor on one shared document', async () => {
    const zentio = await folder('Zentio')
    publish('plan', zentio.id)
    publish('other', zentio.id)
    await folderSharing(
      body({ emails: ['alex@example.com'], role: 'viewer' }),
      env,
      owner,
      zentio.id,
      ['people'],
    )
    await artifactSharing(
      body({ emails: ['alex@example.com'], role: 'editor' }),
      env,
      await inFolder('owner', zentio.id),
      'plan',
      ['people'],
    )
    const alex = await inFolder('alex', zentio.id)
    const listed = await data<Array<{ id: string; role: string }>>(
      listArtifacts(
        new Request('http://drive.test/api/v1/artifacts'),
        env,
        alex,
      ),
    )
    expect(
      Object.fromEntries(listed.map((item) => [item.id, item.role])),
    ).toEqual({ plan: 'editor', other: 'viewer' })
  })

  it('serves content to a document share and stops when it is removed', async () => {
    const projects = await folder('Projects', 'home_owner')
    publish('report', projects.id)
    const sharing = await data(
      artifactSharing(
        body({ emails: ['alex@example.com'], role: 'viewer' }),
        env,
        await inFolder('owner', projects.id),
        'report',
        ['people'],
      ),
    )
    const token = await signContentGrant(env, {
      artifactId: 'report',
      versionId: 'version',
      entryPath: 'index.html',
      principal: { userId: 'alex' },
    })
    const request = new Request(`http://content.test/raw/session/${token}`)
    expect((await startContentSession(request, env, token)).status).toBe(302)
    // Alex leaves it.
    const left = await artifactSharing(del(), env, actor('alex'), 'report', [
      'people',
      sharing.people[0]!.id,
    ])
    expect(left.status).toBe(204)
    await expect(startContentSession(request, env, token)).rejects.toThrow(
      'Document access was removed',
    )
  })

  it('names people before they have signed in', async () => {
    publish('report', 'home_owner')
    const sharing = await data(
      artifactSharing(
        body({ emails: ['later@example.com'], role: 'viewer', notify: true }),
        env,
        owner,
        'report',
        ['people'],
      ),
    )
    expect(sharing.people).toMatchObject([
      { email: 'later@example.com', userId: null, name: null },
    ])
  })
})

describe('links', () => {
  it('adds whoever opens the link, and removes them when it is turned off', async () => {
    const projects = await folder('Projects', 'home_owner')
    publish('report', projects.id)
    const enabled = await data(
      folderSharing(body({ role: 'viewer' }, 'PUT'), env, owner, projects.id, [
        'link',
      ]),
    )
    const token = enabled.link!.url.split('/s/')[1]!
    expect(enabled.link!.url).toBe(`http://drive.test/s/${token}`)

    const opened = await data<{ type: string; folderId: string }>(
      acceptLink(env, actor('stranger'), token),
    )
    expect(opened).toMatchObject({ type: 'folder', folderId: projects.id })
    expect((await folderAccess(env, 'stranger', projects.id)).role).toBe(
      'viewer',
    )
    const sharing = await data(
      folderSharing(get(), env, owner, projects.id, []),
    )
    expect(sharing.people).toMatchObject([
      { email: 'stranger@example.com', viaLink: true },
    ])

    // The owner doesn't gain a share by opening their own link.
    await acceptLink(env, owner, token)
    expect(
      (await data(folderSharing(get(), env, owner, projects.id, []))).people,
    ).toHaveLength(1)

    // Raising the link's role raises everyone who joined through it.
    await folderSharing(
      body({ role: 'editor' }, 'PUT'),
      env,
      owner,
      projects.id,
      ['link'],
    )
    expect((await folderAccess(env, 'stranger', projects.id)).role).toBe(
      'editor',
    )

    await folderSharing(del(), env, owner, projects.id, ['link'])
    await expect(folderAccess(env, 'stranger', projects.id)).rejects.toThrow()
    await expect(acceptLink(env, actor('sam'), token)).rejects.toThrow(
      'no longer works',
    )
  })

  it('opens a document link to its folder and slug', async () => {
    publish('report', 'home_owner')
    const enabled = await data(
      artifactSharing(body({ role: 'viewer' }, 'PUT'), env, owner, 'report', [
        'link',
      ]),
    )
    const token = enabled.link!.url.split('/s/')[1]!
    expect(await data(acceptLink(env, actor('alex'), token))).toEqual({
      type: 'artifact',
      folderId: 'home_owner',
      folderSlug: 'home-owner',
      slug: 'report',
    })
    expect(
      await data(showArtifact(env, actor('alex'), 'report')),
    ).toMatchObject({ role: 'viewer' })
  })
})

describe('shared with me', () => {
  it('lists what others shared directly, not what is in your drives', async () => {
    const projects = await folder('Projects', 'home_owner')
    const zentio = await folder('Zentio')
    publish('report', 'home_owner', 'Report')
    publish('team-plan', zentio.id, 'Team plan')
    await folderSharing(
      body({ emails: ['alex@example.com'], role: 'editor' }),
      env,
      owner,
      projects.id,
      ['people'],
    )
    await artifactSharing(
      body({ emails: ['alex@example.com'], role: 'viewer' }),
      env,
      owner,
      'report',
      ['people'],
    )
    // Alex is a member of Zentio: its documents are Alex's drive, not shares.
    await folderSharing(
      body({ emails: ['alex@example.com'], role: 'viewer' }),
      env,
      owner,
      zentio.id,
      ['people'],
    )
    await artifactSharing(
      body({ emails: ['alex@example.com'], role: 'editor' }),
      env,
      await inFolder('owner', zentio.id),
      'team-plan',
      ['people'],
    )
    const items = await data<
      Array<{
        type: string
        role: string
        folderSlug: string
        sharedBy: { userId: string } | null
        folder?: { id: string }
        artifact?: { id: string }
      }>
    >(sharedWithMe(env, actor('alex')))
    expect(
      items.map((item) => [item.type, item.folder?.id ?? item.artifact?.id]),
    ).toEqual(
      expect.arrayContaining([
        ['folder', projects.id],
        ['artifact', 'report'],
      ]),
    )
    expect(items).toHaveLength(2)
    expect(items.every((item) => item.sharedBy?.userId === 'owner')).toBe(true)
    expect(items.find((item) => item.type === 'artifact')).toMatchObject({
      role: 'viewer',
      folderSlug: 'home-owner',
    })
  })

  it('suggests people you share with, by name or email', async () => {
    const zentio = await folder('Zentio')
    await folderSharing(
      body({ emails: ['alex@example.com'], role: 'viewer' }),
      env,
      owner,
      zentio.id,
      ['people'],
    )
    publish('report', 'home_owner')
    await artifactSharing(
      body({ emails: ['sam@example.com'], role: 'viewer' }),
      env,
      owner,
      'report',
      ['people'],
    )
    const people = await data<Array<{ email: string }>>(
      suggestPeople(
        new Request('http://drive.test/api/v1/people?q='),
        env,
        owner,
      ),
    )
    expect(people.map((entry) => entry.email)).toEqual([
      'alex@example.com',
      'sam@example.com',
    ])
    const found = await data<Array<{ email: string }>>(
      suggestPeople(
        new Request('http://drive.test/api/v1/people?q=SAM'),
        env,
        owner,
      ),
    )
    expect(found.map((entry) => entry.email)).toEqual(['sam@example.com'])
    // And the owner from Alex's side.
    const fromAlex = await data<Array<{ email: string }>>(
      suggestPeople(
        new Request('http://drive.test/api/v1/people'),
        env,
        actor('alex'),
      ),
    )
    expect(fromAlex.map((entry) => entry.email)).toEqual(['owner@example.com'])
  })
})

describe('signing in', () => {
  it('resolves shares made to an email when its owner signs in', async () => {
    publish('report', 'home_owner')
    await artifactSharing(
      body({ emails: ['newcomer@example.com'], role: 'viewer' }),
      env,
      owner,
      'report',
      ['people'],
    )
    db.sqlite
      .prepare(
        'INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)',
      )
      .run('newcomer', 'Newcomer', 'newcomer@example.com', 'x', 'x')
    const auth = createAuth(env)
    const context = await auth.$context
    await context.internalAdapter.createSession('newcomer')
    expect(
      await data(showArtifact(env, actor('newcomer'), 'report')),
    ).toMatchObject({ role: 'viewer' })
    // And their browser requests authenticate as usual.
    const session = db.sqlite
      .prepare("SELECT token FROM session WHERE userId='newcomer'")
      .get()!
    const signedIn = await authenticate(
      new Request('http://drive.test/api/v1/me', {
        headers: { authorization: `Bearer ${String(session.token)}` },
      }),
      env,
      auth,
    )
    expect(signedIn.folderId).toBe('home_newcomer')
  })
})

describe('review hardening', () => {
  it('never changes access given by name when a link is opened or turned off', async () => {
    publish('report', 'home_owner')
    await artifactSharing(
      body({ emails: ['alex@example.com'], role: 'viewer' }),
      env,
      owner,
      'report',
      ['people'],
    )
    const enabled = await data(
      artifactSharing(body({ role: 'editor' }, 'PUT'), env, owner, 'report', [
        'link',
      ]),
    )
    await acceptLink(env, actor('alex'), enabled.link!.url.split('/s/')[1]!)
    const after = await data(artifactSharing(get(), env, owner, 'report', []))
    expect(after.people).toMatchObject([
      { email: 'alex@example.com', role: 'viewer', viaLink: false },
    ])
    await artifactSharing(del(), env, owner, 'report', ['link'])
    expect(
      await data(showArtifact(env, actor('alex'), 'report')),
    ).toMatchObject({ role: 'viewer' })
  })

  it('keeps link access tied to the link', async () => {
    publish('report', 'home_owner')
    const enabled = await data(
      artifactSharing(body({ role: 'editor' }, 'PUT'), env, owner, 'report', [
        'link',
      ]),
    )
    await acceptLink(env, actor('alex'), enabled.link!.url.split('/s/')[1]!)
    await expect(
      artifactSharing(
        body({ emails: ['alex@example.com'], role: 'editor' }),
        env,
        actor('alex'),
        'report',
        ['people'],
      ),
    ).rejects.toThrow('can’t add yourself')
  })

  it('hides folders and drives above what you can open, and link visitors from each other', async () => {
    const zentio = await folder('Zentio')
    const secret = await folder('Secret plans', zentio.id)
    publish('plan', secret.id)
    await folderSharing(
      body({ emails: ['stranger@example.com'], role: 'viewer' }),
      env,
      owner,
      secret.id,
      ['people'],
    )
    await artifactSharing(
      body({ emails: ['alex@example.com'], role: 'viewer' }),
      env,
      await inFolder('owner', secret.id),
      'plan',
      ['people'],
    )
    const enabled = await data(
      artifactSharing(
        body({ role: 'viewer' }, 'PUT'),
        env,
        await inFolder('owner', secret.id),
        'plan',
        ['link'],
      ),
    )
    await acceptLink(env, actor('sam'), enabled.link!.url.split('/s/')[1]!)

    const seenByAlex = await data(
      artifactSharing(get(), env, actor('alex'), 'plan', []),
    )
    expect(seenByAlex.drive.name).toBe('its shared drive')
    expect(seenByAlex.people).toEqual([
      expect.objectContaining({ email: 'alex@example.com' }),
      expect.objectContaining({
        email: 'stranger@example.com',
        inheritedFrom: { id: secret.id, name: 'a folder above' },
      }),
    ])
    // The owner sees everything, the link visitor included.
    const seenByOwner = await data(
      artifactSharing(
        get(),
        env,
        await inFolder('owner', secret.id),
        'plan',
        [],
      ),
    )
    expect(seenByOwner.drive.name).toBe('Zentio')
    expect(seenByOwner.people.map((entry) => entry.email)).toContain(
      'sam@example.com',
    )
    // Someone the folder was shared with sees the folder's name.
    const seenByStranger = await data(
      artifactSharing(get(), env, actor('stranger'), 'plan', []),
    )
    expect(
      seenByStranger.people.find((entry) => entry.inheritedFrom)?.inheritedFrom
        ?.name,
    ).toBe('Secret plans')
  })

  it('gives folder-scoped API keys no contacts', async () => {
    const zentio = await folder('Zentio')
    await folderSharing(
      body({ emails: ['alex@example.com'], role: 'viewer' }),
      env,
      owner,
      zentio.id,
      ['people'],
    )
    const key = {
      ...owner,
      type: 'api_key',
      id: 'key',
      keyScopeId: zentio.id,
      permissions: { artifact: ['read'] },
    } satisfies AuthenticatedActor
    expect(
      await data(
        suggestPeople(new Request('http://drive.test/api/v1/people'), env, key),
      ),
    ).toEqual([])
  })

  it('stops emailing past the daily limit but still shares', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    env.RESEND_API_KEY = 're_test'
    env.EMAIL_FROM = 'Otter Drive <noreply@otterware.app>'
    try {
      const projects = await folder('Projects', 'home_owner')
      const batch = (from: number) =>
        Array.from({ length: 20 }, (_, index) => `p${from + index}@example.com`)
      const results = []
      for (const from of [0, 20, 40])
        results.push(
          (await (
            await folderSharing(
              body({ emails: batch(from), role: 'viewer' }),
              env,
              owner,
              projects.id,
              ['people'],
            )
          ).json()) as { notified: boolean; data: Sharing },
        )
      expect(results.map((result) => result.notified)).toEqual([
        true,
        true,
        false,
      ])
      expect(results[2]!.data.people).toHaveLength(60)
      expect(fetchMock).toHaveBeenCalledTimes(40)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
