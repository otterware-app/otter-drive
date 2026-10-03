import { describe, expect, it } from 'vitest'
import { assertCanPermanentlyDelete } from './actor'
import type { AuthenticatedActor } from './types'

describe('permanent document deletion permissions', () => {
  const actor = (roles: string[], type: 'user' | 'api_key' = 'user') =>
    ({
      type,
      id: 'actor-1',
      name: 'Actor',
      userId: type === 'user' ? 'actor-1' : null,
      folderId: 'folder-1',
      roles,
      permissions: {},
    }) satisfies AuthenticatedActor

  it('allows drive owners', () => {
    expect(() => assertCanPermanentlyDelete(actor(['owner']))).not.toThrow()
  })

  it.each(['admin', 'editor', 'member'])('rejects the %s role', (role) => {
    expect(() => assertCanPermanentlyDelete(actor([role]))).toThrow(
      'Only the drive owner',
    )
  })

  it('rejects API keys even if their role is owner', () => {
    expect(() =>
      assertCanPermanentlyDelete(actor(['owner'], 'api_key')),
    ).toThrow('Only the drive owner')
  })
})
