// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TeamPane } from './team-pane'

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))
vi.mock('../team-role', () => ({
  useTeamRole: () => ({ canManage: true, canEdit: true, isOwner: true }),
}))
vi.mock('../drive/team-rail', () => ({ useCanCreateTeams: () => false }))
vi.mock('../teams', () => ({
  announceTeamsChanged: vi.fn(),
  useTeams: () => ({
    activeTeam: { id: 'org-zentio', name: 'Zentio', slug: 'zentio' },
    teams: [
      { id: 'org-chris', name: 'chris', slug: 'chris' },
      { id: 'org-zentio', name: 'Zentio', slug: 'zentio' },
    ],
    selectTeam: vi.fn(),
  }),
}))
vi.mock('#/lib/auth-client', () => ({
  authClient: { organization: { update: vi.fn() } },
}))

describe('TeamPane', () => {
  it('shows the active team by name, not its database id', async () => {
    render(<TeamPane />)
    const select = await screen.findByRole('combobox', { name: 'Active team' })
    await waitFor(() => expect(select.textContent).toContain('Zentio'))
    expect(select.textContent).not.toContain('org-zentio')
    expect(
      (screen.getByRole('textbox', { name: 'Team name' }) as HTMLInputElement)
        .value,
    ).toBe('Zentio')
  })
})
