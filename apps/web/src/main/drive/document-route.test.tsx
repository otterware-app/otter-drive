// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DocumentRoute } from './document-route'

const { useDrive } = vi.hoisted(() => ({ useDrive: vi.fn() }))

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))
vi.mock('../home-view', () => ({ useDrive }))
vi.mock('./document-viewer', () => ({
  DocumentViewer: ({
    team,
    slug,
  }: {
    team: { id: string; slug: string }
    slug: string
  }) => (
    <div>
      Viewer for {team.slug}/{slug} ({team.id})
    </div>
  ),
}))

const drive = {
  narrow: false,
  expanded: false,
  toggleExpanded: vi.fn(),
  mainIsLeftmost: false,
  teams: [
    { id: 'org-chris', name: 'Chris', slug: 'chris' },
    { id: 'org-zentio', name: 'Zentio', slug: 'zentio' },
  ],
  unknownTeamSlug: null,
}

describe('DocumentRoute', () => {
  afterEach(cleanup)
  beforeEach(() => useDrive.mockReset())

  it('scopes the viewer to the team encoded in the URL', () => {
    useDrive.mockReturnValue(drive)
    render(<DocumentRoute teamSlug="zentio" slug="contract" />)
    expect(
      screen.getByText('Viewer for zentio/contract (org-zentio)'),
    ).not.toBeNull()
  })

  it('explains a team you are not in', () => {
    useDrive.mockReturnValue({ ...drive, unknownTeamSlug: 'acme' })
    render(<DocumentRoute teamSlug="acme" slug="contract" />)
    expect(screen.getByText('Not one of your teams')).not.toBeNull()
  })
})
