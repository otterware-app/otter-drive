// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TeamRail } from './team-rail'

const { session } = vi.hoisted(() => ({
  session: {
    data: {
      user: {
        name: 'Chris Kafrouni',
        email: 'chris@example.com',
        role: 'user',
      },
    },
  },
}))

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))
vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'system', setTheme: vi.fn() }),
}))
vi.mock('#/lib/auth-client', () => ({
  authClient: { useSession: () => session, signOut: vi.fn() },
}))
vi.mock('./new-team-dialog', () => ({ NewTeamDialog: () => null }))

const teams = [
  { id: 'org-1', name: 'Otter Drive Team', slug: 'otterware' },
  { id: 'org-2', name: 'Zentio', slug: 'zentio' },
]

afterEach(cleanup)

describe('TeamRail', () => {
  it('lists the teams, lighting the one showing', () => {
    const onSelectTeam = vi.fn()
    render(
      <TeamRail
        teams={teams}
        currentTeamId="org-1"
        settingsOpen={false}
        onSelectTeam={onSelectTeam}
      />,
    )
    expect(
      screen
        .getByRole('button', { name: 'Otter Drive Team' })
        .getAttribute('aria-current'),
    ).toBe('page')
    expect(
      screen
        .getByRole('button', { name: 'Zentio' })
        .getAttribute('aria-current'),
    ).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Zentio' }))
    expect(onSelectTeam).toHaveBeenCalledWith(teams[1])
  })

  it('offers new teams to platform admins only', () => {
    const { rerender } = render(
      <TeamRail
        teams={teams}
        currentTeamId="org-1"
        settingsOpen={false}
        onSelectTeam={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'New team' })).toBeNull()
    session.data.user.role = 'admin'
    rerender(
      <TeamRail
        teams={teams}
        currentTeamId="org-2"
        settingsOpen={false}
        onSelectTeam={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'New team' })).toBeTruthy()
    session.data.user.role = 'user'
  })

  it('opens the account menu with Settings and Sign out', async () => {
    render(
      <TeamRail
        teams={teams}
        currentTeamId="org-1"
        settingsOpen={false}
        onSelectTeam={vi.fn()}
      />,
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Account and settings' }),
    )
    expect(
      await screen.findByRole('menuitem', { name: 'Settings' }),
    ).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeTruthy()
    expect(screen.getByText('chris@example.com')).toBeTruthy()
  })
})
