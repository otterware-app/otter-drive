import { afterEach, describe, expect, it, vi } from 'vitest'
import { publishDocumentVersion } from './publish-document-version'

afterEach(() => vi.unstubAllGlobals())

const input = () => ({
  blob: new Blob(['abcde'], { type: 'text/markdown' }),
  entryPath: 'docs/README.md',
  folderId: 'org-test',
  slug: 'roadmap',
  baseVersion: 1,
  expectedCurrentVersion: 4,
})
const now = '2026-10-02T08:00:00Z'
const version = {
  id: 'version-5',
  number: 5,
  label: 'Edited',
  entryPath: 'docs/README.md',
  createdAt: now,
  createdBy: null,
  fileCount: 3,
  byteSize: 100,
  contentHash: 'hash',
}
const artifact = {
  id: 'artifact-1',
  folderId: 'org-test',
  ownerUserId: null,
  slug: 'roadmap',
  title: 'Roadmap',
  description: '',
  createdAt: now,
  updatedAt: now,
  archivedAt: null,
  versionCount: 5,
  currentVersion: version,
  url: 'https://drive.otterware.app/test/a/roadmap',
}

function mockUpload(multipart = false, failUpload = false) {
  const fetcher = vi.fn(async (path: string, init?: RequestInit) => {
    if (path.endsWith('/roadmap/uploads'))
      return Response.json({
        data: {
          id: 'upload-1',
          artifactId: 'artifact-1',
          expiresAt: now,
          files: [
            {
              path: 'docs/README.md',
              uploadUrl:
                'https://drive.otterware.app/api/v1/uploads/upload-1/files/readme',
              multipart,
              ...(multipart ? { partSize: 2 } : {}),
            },
          ],
        },
      })
    if (init?.method === 'PUT') {
      if (failUpload)
        return Response.json(
          { error: { code: 'forbidden', message: 'Upload denied' } },
          { status: 403 },
        )
      return multipart
        ? Response.json({
            data: {
              partNumber: Number(new URL(path).searchParams.get('part')),
              etag: `etag-${new URL(path).searchParams.get('part')}`,
            },
          })
        : new Response(null, { status: 204 })
    }
    if (path.endsWith('/files/readme/complete'))
      return new Response(null, { status: 204 })
    return Response.json({ data: { artifact, version } })
  })
  vi.stubGlobal('fetch', fetcher)
  return fetcher
}

describe('publishDocumentVersion', () => {
  it('uses the edited source version and optimistic concurrency when saving', async () => {
    const fetcher = mockUpload()
    expect(await publishDocumentVersion(input())).toBe(5)
    const manifest = JSON.parse(fetcher.mock.calls[0]![1]!.body as string)
    expect(manifest).toMatchObject({
      baseVersion: 1,
      expectedCurrentVersion: 4,
      entryPath: 'docs/README.md',
      files: [
        { path: 'docs/README.md', contentType: 'text/markdown', size: 5 },
      ],
    })
    expect(manifest.files[0].sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(fetcher).toHaveBeenCalledTimes(3)
    for (const [, init] of fetcher.mock.calls)
      expect(new Headers(init?.headers).get('x-otterdrive-folder')).toBe(
        'org-test',
      )
  })

  it('uploads every multipart chunk and completes the file before publishing', async () => {
    const fetcher = mockUpload(true)
    expect(await publishDocumentVersion(input())).toBe(5)
    const puts = fetcher.mock.calls.filter(([, init]) => init?.method === 'PUT')
    expect(puts.map(([url]) => new URL(url).searchParams.get('part'))).toEqual([
      '1',
      '2',
      '3',
    ])
    expect(
      await Promise.all(puts.map(([, init]) => (init!.body as Blob).text())),
    ).toEqual(['ab', 'cd', 'e'])
    const completed = fetcher.mock.calls.find(([url]) =>
      url.endsWith('/files/readme/complete'),
    )!
    expect(JSON.parse(completed[1]!.body as string).parts).toEqual([
      { partNumber: 1, etag: 'etag-1' },
      { partNumber: 2, etag: 'etag-2' },
      { partNumber: 3, etag: 'etag-3' },
    ])
    expect(fetcher.mock.calls.at(-1)?.[0]).toBe(
      '/api/v1/uploads/upload-1/complete',
    )
    for (const [, init] of fetcher.mock.calls)
      expect(new Headers(init?.headers).get('x-otterdrive-folder')).toBe(
        'org-test',
      )
  })

  it('does not publish a version when uploading its edited file fails', async () => {
    const fetcher = mockUpload(false, true)
    await expect(publishDocumentVersion(input())).rejects.toThrow(
      'Upload denied',
    )
    expect(
      fetcher.mock.calls.some(([path]) => path.endsWith('/complete')),
    ).toBe(false)
  })
})
