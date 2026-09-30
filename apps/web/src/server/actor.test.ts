import { describe, expect, it, vi } from 'vitest'
import { assertCanPermanentlyDelete, authenticate } from './actor'
import type { AuthenticatedActor, Env } from './types'
import type { OtterDriveAuth } from './auth'

describe('bearer authentication fast path', () => {
  it('loads the user and requested membership in one D1 query', async () => {
    const first = vi.fn().mockResolvedValue({
      userId: 'user-1',
      name: 'Chris',
      email: 'chris@example.com',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      id: 'member-1',
      organizationId: 'organization-1',
      role: 'owner',
    })
    const bind = vi.fn(() => ({ first }))
    const prepare = vi.fn(() => ({ bind }))
    const getSession = vi.fn()
    const actor = await authenticate(
      new Request('https://drive.otterware.app/api/v1/me', {
        headers: {
          authorization: 'Bearer raw-session.signed-value',
          'x-otterdrive-organization': 'organization-1',
        },
      }),
      { DB: { prepare } as unknown as D1Database } as Env,
      { api: { getSession } } as unknown as OtterDriveAuth,
    )

    expect(bind).toHaveBeenCalledWith('organization-1', 'raw-session')
    expect(getSession).not.toHaveBeenCalled()
    expect(actor).toMatchObject({
      userId: 'user-1',
      organizationId: 'organization-1',
      roles: ['owner'],
    })
  })
})

describe('permanent document deletion permissions', () => {
  const actor = (roles: string[], type: 'user' | 'api_key' = 'user') =>
    ({
      type,
      id: 'actor-1',
      name: 'Actor',
      userId: type === 'user' ? 'actor-1' : null,
      organizationId: 'organization-1',
      roles,
      permissions: {},
    }) satisfies AuthenticatedActor

  it('allows workspace owners', () => {
    expect(() => assertCanPermanentlyDelete(actor(['owner']))).not.toThrow()
  })

  it.each(['admin', 'editor', 'member'])('rejects the %s role', (role) => {
    expect(() => assertCanPermanentlyDelete(actor([role]))).toThrow(
      'Only the workspace owner',
    )
  })

  it('rejects API keys even if their role is owner', () => {
    expect(() =>
      assertCanPermanentlyDelete(actor(['owner'], 'api_key')),
    ).toThrow('Only the workspace owner')
  })
})
