import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { unzipSync } from 'fflate'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  completeUploadResponseSchema,
  uploadSessionResponseSchema,
  artifactPreviewResponseSchema,
} from '@otterware/contracts'
import {
  completeUpload,
  createUpload,
  downloadArtifact,
  previewArtifact,
  readContent,
  uploadFile,
} from './artifacts'
import { serveRawContent, startContentSession } from './content'
import type { AuthenticatedActor, Env } from './types'

vi.mock('cloudflare:workers', () => ({ waitUntil: vi.fn() }))
vi.mock('./thumbnails', () => ({
  generateThumbnail: vi.fn().mockResolvedValue('thumbnail'),
}))

const databases: DatabaseSync[] = []
afterEach(() => {
  databases.splice(0).forEach((db) => db.close())
  vi.useRealTimers()
})

const actor: AuthenticatedActor = {
  type: 'user',
  id: 'user-1',
  name: 'Test user',
  userId: 'user-1',
  folderId: 'org-1',
  roles: ['owner'],
  permissions: {},
}

async function hash(text: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)),
    ),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('')
}

async function fixture() {
  const db = new DatabaseSync(':memory:')
  databases.push(db)
  for (const name of readdirSync(new URL('../../migrations/', import.meta.url))
    .filter((f) => f.endsWith('.sql'))
    .sort())
    db.exec(
      readFileSync(
        new URL(`../../migrations/${name}`, import.meta.url),
        'utf8',
      ),
    )
  db.exec(`INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES('user-1','Test','test@example.com',1,'2026-01-01','2026-01-01');
    INSERT INTO folder(id,name,slug,owner_user_id,kind,created_at,updated_at) VALUES('org-1','Test','test','user-1','personal','2026-01-01','2026-01-01');`)
  function prepare(sql: string) {
    let values: Array<string | number | null> = []
    const statement = {
      bind: (...args: Array<string | number | null>) => {
        values = args
        return statement
      },
      first: async () => db.prepare(sql).get(...values) ?? null,
      all: async () => ({
        results: db.prepare(sql).all(...values),
        success: true,
      }),
      run: async () => ({
        success: true,
        meta: { changes: Number(db.prepare(sql).run(...values).changes) },
      }),
    }
    return statement
  }
  const objects = new Map<
    string,
    { text: string; contentType: string; sha256: string }
  >()
  const env = {
    APP_URL: 'https://drive.otterware.app',
    CONTENT_URL: 'https://usercontent.otterware.app',
    CONTENT_SIGNING_KEY: 'test-content-key-at-least-thirty-two-characters',
    DB: {
      prepare,
      batch: async (statements: Array<ReturnType<typeof prepare>>) => {
        db.exec('BEGIN')
        try {
          const results = []
          for (const statement of statements)
            results.push(await statement.run())
          db.exec('COMMIT')
          return results
        } catch (error) {
          db.exec('ROLLBACK')
          throw error
        }
      },
    },
    ARTIFACTS: {
      delete: vi.fn(async (keys: string[]) => {
        keys.forEach((key) => objects.delete(key))
      }),
      get: vi.fn(async (key: string) => {
        const object = objects.get(key)
        if (!object) return null
        return {
          body: new Response(object.text).body,
          size: new TextEncoder().encode(object.text).length,
          httpEtag: 'etag',
          customMetadata: { sha256: object.sha256 },
        }
      }),
      head: vi.fn(async (key: string) => {
        const object = objects.get(key)
        return object
          ? {
              size: new TextEncoder().encode(object.text).length,
              customMetadata: { sha256: object.sha256 },
            }
          : null
      }),
      put: vi.fn(
        async (
          key: string,
          body: BodyInit,
          options: {
            httpMetadata: { contentType: string }
            customMetadata: { sha256: string }
          },
        ) => {
          objects.set(key, {
            text: await new Response(body).text(),
            contentType: options.httpMetadata.contentType,
            sha256: options.customMetadata.sha256,
          })
        },
      ),
    },
  } as unknown as Env
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO artifact (id, folder_id, owner_user_id, created_by_actor_type, created_by_actor_id, slug, title, state, current_version_id, version_count, created_at, updated_at)
    VALUES ('artifact-1', 'org-1', 'user-1', 'user', 'user-1', 'roadmap', 'Roadmap', 'published', 'version-2', 2, ?, ?)`,
  ).run(now, now)
  for (const number of [1, 2]) {
    const files = [
      {
        path: 'docs/README.md',
        contentType: 'text/markdown',
        text: `# Version ${number}\n\n![Chart](images/chart.svg)`,
      },
      {
        path: 'docs/images/chart.svg',
        contentType: 'image/svg+xml',
        text: `<svg>Chart from version ${number}</svg>`,
      },
      {
        path: 'files/report.pdf',
        contentType: 'application/pdf',
        text: `Report from version ${number}`,
      },
    ]
    db.prepare(
      `INSERT INTO artifact_version (id, artifact_id, number, label, entry_path, created_at, created_by_user_id, created_by_name, file_count, byte_size, content_hash)
      VALUES (?, 'artifact-1', ?, 'Release', 'docs/README.md', ?, 'user-1', 'Test user', 3, ?, 'hash')`,
    ).run(
      `version-${number}`,
      number,
      now,
      files.reduce(
        (sum, file) => sum + new TextEncoder().encode(file.text).length,
        0,
      ),
    )
    for (const file of files) {
      const key = `versions/artifact-1/version-${number}/${file.path}`
      const sha256 = await hash(file.text)
      objects.set(key, { ...file, sha256 })
      db.prepare(
        'INSERT INTO artifact_file (version_id, path, content_type, size, sha256, r2_key) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(
        `version-${number}`,
        file.path,
        file.contentType,
        new TextEncoder().encode(file.text).length,
        sha256,
        key,
      )
    }
  }
  const edited = '# Edited roadmap\n\n![Chart](images/chart.svg)'
  const file = {
    path: 'docs/README.md',
    contentType: 'text/markdown',
    size: new TextEncoder().encode(edited).length,
    sha256: await hash(edited),
  }
  async function create(
    baseVersion?: number,
    expectedCurrentVersion = 2,
    caller = actor,
  ) {
    return uploadSessionResponseSchema.parse(
      await (
        await createUpload(
          new Request(
            'https://drive.otterware.app/api/v1/artifacts/roadmap/uploads',
            {
              method: 'POST',
              body: JSON.stringify({
                label: 'Edit',
                entryPath: file.path,
                expectedCurrentVersion,
                baseVersion,
                files: [file],
              }),
            },
          ),
          env,
          caller,
          'roadmap',
        )
      ).json(),
    ).data
  }
  function requestForFile(
    text = edited,
    path = file.path,
    sha256 = file.sha256,
  ) {
    const encodedPath = btoa(path)
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replaceAll('=', '')
    const request = new Request(
      'https://drive.otterware.app/api/v1/uploads/file',
      {
        method: 'PUT',
        body: text,
        headers: {
          'content-length': String(new TextEncoder().encode(text).length),
          'x-content-sha256': sha256,
        },
      },
    )
    return { request, encodedPath }
  }
  async function publish(baseVersion?: number) {
    const session = await create(baseVersion)
    const upload = requestForFile()
    await uploadFile(upload.request, env, actor, session.id, upload.encodedPath)
    return completeUploadResponseSchema.parse(
      await (await completeUpload(env, actor, session.id)).json(),
    ).data
  }
  return { db, env, objects, create, publish, requestForFile, edited }
}

describe('publishing document edits', () => {
  it('preserves all companion files from the source version and leaves old versions intact', async () => {
    const { db, env, objects, create, requestForFile, edited } = await fixture()
    const before = [...objects.entries()].map(([key, object]) => [
      key,
      { ...object },
    ])
    const session = await create(1)
    expect(session.files.map((file) => file.path)).toEqual(['docs/README.md'])
    const upload = requestForFile()
    await uploadFile(upload.request, env, actor, session.id, upload.encodedPath)
    const published = completeUploadResponseSchema.parse(
      await (await completeUpload(env, actor, session.id)).json(),
    ).data
    expect(published.version.number).toBe(3)
    expect(published.version.fileCount).toBe(3)
    expect(published.artifact.currentVersion?.number).toBe(3)
    const files = db
      .prepare('SELECT * FROM artifact_file WHERE version_id = ? ORDER BY path')
      .all(published.version.id)
    expect(files.map((file) => file.path)).toEqual([
      'docs/README.md',
      'docs/images/chart.svg',
      'files/report.pdf',
    ])
    expect(
      files.every((file) =>
        String(file.r2_key).startsWith(
          `versions/artifact-1/${published.version.id}/`,
        ),
      ),
    ).toBe(true)
    for (const [key, object] of before)
      expect(objects.get(key as string)).toEqual(object)
    const image = await readContent(
      new Request(
        'https://drive.otterware.app/api/v1/artifacts/roadmap/content?version=3&path=docs/images/chart.svg',
      ),
      env,
      actor,
      'roadmap',
    )
    expect(await image.text()).toBe('<svg>Chart from version 1</svg>')
    const archive = unzipSync(
      new Uint8Array(
        await (
          await downloadArtifact(
            new Request(
              'https://drive.otterware.app/api/v1/artifacts/roadmap/download?version=3',
            ),
            env,
            actor,
            'roadmap',
          )
        ).arrayBuffer(),
      ),
    )
    expect(new TextDecoder().decode(archive['docs/README.md'])).toBe(edited)
    expect(new TextDecoder().decode(archive['files/report.pdf'])).toBe(
      'Report from version 1',
    )
  })

  it('keeps full-upload replacement semantics when no source version is supplied', async () => {
    const { publish } = await fixture()
    expect((await publish()).version.fileCount).toBe(1)
  })

  it('prevents clients from overwriting carried-forward files', async () => {
    const { create, env, requestForFile } = await fixture()
    const session = await create(2)
    const body = '<svg>Chart from version 2</svg>'
    const upload = requestForFile(
      body,
      'docs/images/chart.svg',
      await hash(body),
    )
    await expect(
      uploadFile(upload.request, env, actor, session.id, upload.encodedPath),
    ).rejects.toMatchObject({ status: 404, code: 'file_not_expected' })
  })

  it('rejects a nonexistent source version before copying files', async () => {
    const { create, env } = await fixture()
    await expect(create(999)).rejects.toMatchObject({
      status: 404,
      code: 'version_not_found',
    })
    expect(env.ARTIFACTS.put).not.toHaveBeenCalled()
  })

  it('rejects stale saves and publishing after another writer completes a version', async () => {
    const { create, db, env, requestForFile } = await fixture()
    await expect(create(1, 1)).rejects.toMatchObject({
      status: 409,
      code: 'version_conflict',
    })
    expect(env.ARTIFACTS.put).not.toHaveBeenCalled()
    const session = await create(1)
    const upload = requestForFile()
    await uploadFile(upload.request, env, actor, session.id, upload.encodedPath)
    db.prepare('UPDATE artifact SET version_count = 3').run()
    await expect(completeUpload(env, actor, session.id)).rejects.toMatchObject({
      status: 409,
      code: 'version_conflict',
    })
    expect(
      db.prepare('SELECT COUNT(*) AS count FROM artifact_version').get()?.count,
    ).toBe(2)
  })

  it('denies edits to viewers and callers from another folder', async () => {
    const { create, env } = await fixture()
    await expect(
      create(1, 2, { ...actor, roles: ['viewer'] }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      create(1, 2, { ...actor, folderId: 'other-org' }),
    ).rejects.toMatchObject({ status: 404 })
    expect(env.ARTIFACTS.put).not.toHaveBeenCalled()
  })

  it('fails a save if a companion object is missing instead of publishing broken references', async () => {
    const { create, objects } = await fixture()
    objects.delete('versions/artifact-1/version-1/docs/images/chart.svg')
    await expect(create(1)).rejects.toMatchObject({
      status: 409,
      code: 'base_file_missing',
    })
  })

  it('cleans up partially copied files if preparing an edit fails', async () => {
    const { create, objects, db, env } = await fixture()
    objects.delete('versions/artifact-1/version-1/files/report.pdf')
    const before = [...objects.keys()]
    await expect(create(1)).rejects.toMatchObject({ code: 'base_file_missing' })
    expect(env.ARTIFACTS.put).toHaveBeenCalledOnce()
    expect([...objects.keys()]).toEqual(before)
    expect(
      db.prepare('SELECT COUNT(*) AS count FROM artifact_upload').get()?.count,
    ).toBe(0)
  })
})

describe('Markdown content sessions', () => {
  it('serves late resources after the initial grant expires, within the selected version', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-02T08:00:00Z'))
    const { env } = await fixture()
    const preview = artifactPreviewResponseSchema.parse(
      await (
        await previewArtifact(
          new Request(
            'https://drive.otterware.app/api/v1/artifacts/roadmap/preview?version=1',
          ),
          env,
          actor,
          'roadmap',
        )
      ).json(),
    ).data
    expect(preview.resourceBaseUrl).toBe(
      'https://usercontent.otterware.app/raw/a/artifact-1/version-1/',
    )
    const token = new URL(preview.url).pathname.split('/').pop()!
    const session = await startContentSession(
      new Request(preview.url),
      env,
      token,
    )
    const cookie = session.headers.get('set-cookie')!.split(';')[0]!
    vi.setSystemTime(new Date('2026-10-02T08:06:00Z'))
    await expect(
      startContentSession(new Request(preview.url), env, token),
    ).rejects.toMatchObject({ code: 'expired_grant' })
    const imageUrl = new URL('docs/images/chart.svg', preview.resourceBaseUrl)
    const request = new Request(imageUrl, { headers: { cookie } })
    expect(
      await (
        await serveRawContent(
          request,
          env,
          'artifact-1',
          'version-1',
          'docs/images/chart.svg',
        )
      ).text(),
    ).toBe('<svg>Chart from version 1</svg>')
    await expect(
      serveRawContent(
        request,
        env,
        'artifact-1',
        'version-2',
        'docs/images/chart.svg',
      ),
    ).rejects.toMatchObject({ status: 403 })
    vi.setSystemTime(new Date('2026-10-02T12:01:00Z'))
    await expect(
      serveRawContent(
        request,
        env,
        'artifact-1',
        'version-1',
        'docs/images/chart.svg',
      ),
    ).rejects.toMatchObject({ code: 'expired_grant' })
  })
})
