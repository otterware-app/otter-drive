import { describe, expect, it } from 'vitest'
import type { Sharing } from '@otterware/contracts'
import { accessRows, parseRole } from '../src/sharing'

describe('sharing', () => {
  it('accepts only viewer and editor', () => {
    expect(parseRole('viewer')).toBe('viewer')
    expect(parseRole('editor')).toBe('editor')
    expect(() => parseRole('owner')).toThrow('viewer')
  })

  it('lists the owner, a shared drive’s members and each person', () => {
    const sharing: Sharing = {
      resource: {
        type: 'folder',
        id: 'f',
        name: 'Design',
        folderKind: 'folder',
      },
      drive: { id: 'd', name: 'Zentio', kind: 'shared', memberCount: 3 },
      owner: {
        userId: 'o',
        email: 'chris@example.com',
        name: 'Chris',
        image: null,
      },
      role: 'owner',
      canShare: true,
      people: [
        {
          id: '1',
          userId: null,
          email: 'new@example.com',
          name: null,
          image: null,
          role: 'viewer',
          inheritedFrom: null,
          viaLink: false,
        },
        {
          id: '2',
          userId: 'a',
          email: 'alex@example.com',
          name: 'Alex',
          image: null,
          role: 'editor',
          inheritedFrom: { id: 'p', name: 'Projects' },
          viaLink: false,
        },
      ],
      link: null,
      inheritedLink: null,
    }
    expect(
      accessRows(sharing).map((row) => [row.person, row.access, row.via]),
    ).toEqual([
      ['Chris', 'owner', ''],
      ['Members of Zentio', '3 people', 'shared drive'],
      ['new@example.com', 'viewer', 'not signed in yet'],
      ['Alex', 'editor', 'from Projects'],
    ])
  })
})
