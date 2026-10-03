// @vitest-environment jsdom
import { cleanup, render, waitFor, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Route } from './login'

const { signIn, search } = vi.hoisted(() => ({
  signIn: vi.fn(),
  search: {} as Record<string, string>,
}))
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: object) => ({
    options,
    useSearch: () => search,
  }),
}))
vi.mock('#/lib/auth-client', () => ({
  authClient: {
    useSession: () => ({ data: null, isPending: false }),
    signIn: { social: signIn },
  },
}))
vi.mock('#/main/auth/auth-shell', () => ({
  AuthShell: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
  AuthMessage: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
}))

beforeEach(() => {
  signIn.mockReset().mockResolvedValue({})
  for (const key of Object.keys(search)) delete search[key]
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('automatically reuses an Accounts session and keeps the requested Drive destination', async () => {
  search.callback = '/home?folder=shared'
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ url: 'https://accounts.test/otter/session' }),
    )
    .mockResolvedValueOnce(Response.json({ signedIn: true }))
  vi.stubGlobal('fetch', fetch)
  const Login = Route.options.component!
  render(<Login />)
  await waitFor(() =>
    expect(signIn).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'otter',
        callbackURL: search.callback,
      }),
    ),
  )
  expect(fetch).toHaveBeenLastCalledWith(
    'https://accounts.test/otter/session',
    expect.objectContaining({ credentials: 'include' }),
  )
  expect(signIn).toHaveBeenCalledTimes(1)
})

it.each([false, 'unavailable'])(
  'keeps explicit sign-in available when Accounts is %s',
  async (status) => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ url: 'https://accounts.test/otter/session' }),
      )
    if (status === false)
      fetch.mockResolvedValueOnce(Response.json({ signedIn: false }))
    else fetch.mockRejectedValueOnce(new Error('offline'))
    vi.stubGlobal('fetch', fetch)
    const Login = Route.options.component!
    render(<Login />)
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    expect(signIn).not.toHaveBeenCalled()
    expect(
      screen.getByRole('button', { name: 'Continue with Otter' }),
    ).toBeDefined()
  },
)

it.each(['error', 'signed_out'])(
  'does not restart OAuth after %s',
  async (reason) => {
    search[reason] = '1'
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const Login = Route.options.component!
    render(<Login />)
    expect(fetch).not.toHaveBeenCalled()
    expect(signIn).not.toHaveBeenCalled()
  },
)
