// @vitest-environment jsdom

import * as React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppHeader } from './app-header'

vi.mock('@tanstack/react-router', () => ({
  Link: React.forwardRef<
    HTMLAnchorElement,
    React.AnchorHTMLAttributes<HTMLAnchorElement> & {
      to: string
      activeProps?: React.AnchorHTMLAttributes<HTMLAnchorElement>
    }
  >(function MockLink({ to, activeProps: _activeProps, ...props }, ref) {
    return <a ref={ref} href={to} {...props} />
  }),
  useLocation: ({
    select,
  }: {
    select?: (location: { pathname: string }) => unknown
  } = {}) => {
    const location = { pathname: '/home' }
    return select ? select(location) : location
  },
  useNavigate: () => vi.fn(),
}))

vi.mock('#/lib/auth-client', () => ({
  authClient: {
    useSession: () => ({
      data: {
        user: { name: 'Chris Kafrouni', email: 'chris@example.com' },
      },
    }),
    signOut: vi.fn(),
  },
}))

vi.mock('@/hooks/use-organizations', () => ({
  useOrganizations: () => ({
    activeOrganization: {
      id: 'org-1',
      name: 'Otter Drive Team',
      slug: 'otterware',
    },
    organizations: [
      { id: 'org-1', name: 'Otter Drive Team', slug: 'otterware' },
      { id: 'org-2', name: 'Zentio', slug: 'zentio' },
    ],
    selectOrganization: vi.fn(),
  }),
}))

vi.mock('#/lib/session-cache', () => ({ useHydrated: () => true }))

afterEach(cleanup)

describe('AppHeader', () => {
  it('shows the brand then the team crumb, with no page title on home', () => {
    const { container } = render(<AppHeader />)
    const start = container.querySelector('.app-header-start')!

    expect(start.querySelector('.topbar-brand')?.textContent).toBe(
      'Otter Drive',
    )
    expect(start.querySelector('.team-switcher')?.textContent).toBe(
      'Otter Drive Team',
    )
    expect(start.querySelector('.app-breadcrumb strong')).toBeNull()
    expect(container.querySelector('.app-sidebar')).toBeNull()
  })

  it('keeps the account button as the last item in the top bar', () => {
    const { container } = render(
      <AppHeader actions={<button>Upload</button>} />,
    )
    const header = container.querySelector('.app-header')!
    const account = header.querySelector('.account-button')!

    expect(account.textContent).toBe('CH')
    expect(header.querySelector('.app-header-end')?.lastElementChild).toBe(
      account,
    )
    expect(
      header
        .querySelector('.app-header-actions')!
        .compareDocumentPosition(account) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('opens an account menu with settings but no Documents link', async () => {
    const { container } = render(<AppHeader />)
    fireEvent.click(container.querySelector('.account-button')!)
    const settings = await screen.findByRole('menuitem', { name: 'Settings' })
    expect(settings.getAttribute('href')).toBe('/settings')
    expect(screen.queryByRole('menuitem', { name: 'Documents' })).toBeNull()
    expect(screen.getByText('chris@example.com')).toBeTruthy()
  })

  it('lists teams in the switcher with a new team action', async () => {
    const { container } = render(<AppHeader />)
    fireEvent.click(container.querySelector('.team-switcher')!)

    const active = await screen.findByRole('menuitem', {
      name: 'Otter Drive Team',
    })
    expect(active.getAttribute('aria-current')).toBe('true')
    expect(screen.getByRole('menuitem', { name: 'Zentio' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'New team' })).toBeTruthy()
  })
})
