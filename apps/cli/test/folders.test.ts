import { describe, expect, it } from 'vitest'
import { resolveFolderReference } from '../src/folders'

const folders = [
  {
    id: 'folder-1',
    slug: 'chris',
    name: 'Chris',
    createdAt: '2026-07-10T00:00:00.000Z',
  },
  {
    id: 'folder-2',
    slug: 'otterdrive-team',
    name: 'Otter Drive Team',
    createdAt: '2026-07-10T00:00:00.000Z',
  },
]

describe('folder reference resolution', () => {
  it('accepts an ID, slug, or case-insensitive unique name', () => {
    expect(resolveFolderReference(folders, 'folder-1').id).toBe('folder-1')
    expect(resolveFolderReference(folders, 'CHRIS').id).toBe('folder-1')
    expect(resolveFolderReference(folders, 'otter drive team').id).toBe(
      'folder-2',
    )
  })

  it('rejects missing and ambiguous names', () => {
    expect(() => resolveFolderReference(folders, 'missing')).toThrow(
      'was not found',
    )
    expect(() =>
      resolveFolderReference(
        [
          ...folders,
          {
            ...folders[0]!,
            id: 'folder-3',
            slug: 'shared-one',
            name: 'Shared',
          },
          {
            ...folders[0]!,
            id: 'folder-4',
            slug: 'shared-two',
            name: 'Shared',
          },
        ],
        'Shared',
      ),
    ).toThrow('More than one')
  })
})
