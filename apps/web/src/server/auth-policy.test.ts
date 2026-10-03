import { expect, it } from 'vitest'
import { authorizeNewUser, normalizeEmail } from './auth-policy'
import type { Env } from './types'
it('allows personal accounts without a drive invitation', async () => {
  expect(
    await authorizeNewUser(
      { ADMIN_EMAIL: 'owner@example.com' } as Env,
      'person@example.com',
    ),
  ).toBe('user')
  expect(normalizeEmail(' PERSON@Example.com ')).toBe('person@example.com')
})
