import { describe, expect, it } from 'vitest'
import { resolveOrganizationReference } from '../src/organizations'

const organizations = [
  {
    id: 'organization-1',
    slug: 'chris',
    name: 'Chris',
    createdAt: '2026-07-10T00:00:00.000Z',
  },
  {
    id: 'organization-2',
    slug: 'otterdrive-team',
    name: 'Otter Drive Team',
    createdAt: '2026-07-10T00:00:00.000Z',
  },
]

describe('organization reference resolution', () => {
  it('accepts an ID, slug, or case-insensitive unique name', () => {
    expect(
      resolveOrganizationReference(organizations, 'organization-1').id,
    ).toBe('organization-1')
    expect(resolveOrganizationReference(organizations, 'CHRIS').id).toBe(
      'organization-1',
    )
    expect(
      resolveOrganizationReference(organizations, 'otter drive team').id,
    ).toBe('organization-2')
  })

  it('rejects missing and ambiguous names', () => {
    expect(() =>
      resolveOrganizationReference(organizations, 'missing'),
    ).toThrow('was not found')
    expect(() =>
      resolveOrganizationReference(
        [
          ...organizations,
          {
            ...organizations[0]!,
            id: 'organization-3',
            slug: 'shared-one',
            name: 'Shared',
          },
          {
            ...organizations[0]!,
            id: 'organization-4',
            slug: 'shared-two',
            name: 'Shared',
          },
        ],
        'Shared',
      ),
    ).toThrow('More than one')
  })
})
