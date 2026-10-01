import { describe, expect, it } from 'vitest'
import type { Artifact } from '@otterware/contracts'
import {
  documentKind,
  driveSearchSchema,
  inView,
  visibleDocuments,
} from './documents'

function artifact(
  overrides: Partial<Artifact> & { entryPath?: string },
): Artifact {
  const { entryPath = 'index.html', ...rest } = overrides
  return {
    id: rest.slug ?? 'doc',
    organizationId: 'org',
    ownerUserId: null,
    slug: 'doc',
    title: 'Doc',
    description: '',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    archivedAt: null,
    currentVersion: {
      id: 'v1',
      number: 1,
      label: '',
      entryPath,
      createdAt: '2026-09-01T00:00:00.000Z',
      createdBy: null,
      fileCount: 1,
      byteSize: 1,
      contentHash: 'hash',
    },
    versionCount: 1,
    url: 'https://example.com',
    ...rest,
  }
}

describe('drive URL state', () => {
  it('accepts shareable list controls', () => {
    expect(
      driveSearchSchema.parse({
        q: ' roadmap ',
        sort: 'az',
        view: 'archived',
        kind: 'spreadsheets',
      }),
    ).toEqual({
      q: ' roadmap ',
      sort: 'az',
      view: 'archived',
      kind: 'spreadsheets',
    })
  })

  it('drops invalid enumerated URL state', () => {
    expect(
      driveSearchSchema.parse({ sort: 'oldest', view: 'grid', kind: 'videos' }),
    ).toEqual({ sort: undefined, view: undefined, kind: undefined })
  })
})

describe('documents', () => {
  it('knows a document by its entry file', () => {
    expect(documentKind(artifact({ entryPath: 'notes.md' }))).toBe('documents')
    expect(documentKind(artifact({ entryPath: 'q3.XLSX' }))).toBe(
      'spreadsheets',
    )
    expect(documentKind(artifact({ entryPath: 'site/index.html' }))).toBe(
      'pages',
    )
    expect(documentKind(artifact({ entryPath: 'logo.svg' }))).toBe('images')
    expect(documentKind(artifact({ entryPath: 'bundle.zip' }))).toBe('other')
  })

  it('puts archived documents only in Archived, and recent ones in this week', () => {
    const now = Date.parse('2026-09-30T12:00:00.000Z')
    const recent = artifact({ updatedAt: '2026-09-29T12:00:00.000Z' })
    const old = artifact({ updatedAt: '2026-08-01T12:00:00.000Z' })
    const archived = artifact({ archivedAt: '2026-09-29T12:00:00.000Z' })
    expect(inView(recent, 'recent', now)).toBe(true)
    expect(inView(old, 'recent', now)).toBe(false)
    expect(inView(archived, 'all', now)).toBe(false)
    expect(inView(archived, 'archived', now)).toBe(true)
  })

  it('searches, filters by kind and sorts', () => {
    const list = [
      artifact({
        slug: 'b',
        title: 'Budget',
        entryPath: 'budget.csv',
        updatedAt: '2026-09-02T00:00:00.000Z',
      }),
      artifact({
        slug: 'a',
        title: 'Atlas',
        description: 'maps',
        updatedAt: '2026-09-03T00:00:00.000Z',
      }),
      artifact({
        slug: 'c',
        title: 'Charter',
        entryPath: 'charter.md',
        updatedAt: '2026-09-01T00:00:00.000Z',
      }),
    ]
    expect(visibleDocuments(list, {}).map((item) => item.slug)).toEqual([
      'a',
      'b',
      'c',
    ])
    expect(
      visibleDocuments(list, { sort: 'az' }).map((item) => item.slug),
    ).toEqual(['a', 'b', 'c'])
    expect(
      visibleDocuments(list, { sort: 'za' }).map((item) => item.slug),
    ).toEqual(['c', 'b', 'a'])
    expect(
      visibleDocuments(list, { q: 'MAPS' }).map((item) => item.slug),
    ).toEqual(['a'])
    expect(
      visibleDocuments(list, { kind: 'spreadsheets' }).map((item) => item.slug),
    ).toEqual(['b'])
  })
})
