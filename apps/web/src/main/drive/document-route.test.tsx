// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DocumentRoute } from './document-route'

const { useDrive } = vi.hoisted(() => ({ useDrive: vi.fn() }))

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))
vi.mock('../home-view', () => ({ useDrive }))
vi.mock('./document-viewer', () => ({
  DocumentViewer: ({
    location,
    slug,
  }: {
    location: {
      folderId: string | undefined
      folderSlug: string
      reference: string
    }
    slug: string
  }) => (
    <div>
      Viewer for {location.folderSlug}/{slug} via {location.folderId ?? 'id'}:
      {location.reference}
    </div>
  ),
}))

const drive = {
  narrow: false,
  expanded: false,
  toggleExpanded: vi.fn(),
  mainIsLeftmost: false,
  folders: [
    { id: 'org-chris', name: 'Chris', slug: 'chris' },
    { id: 'org-zentio', name: 'Zentio', slug: 'zentio' },
  ],
  foldersLoaded: true,
  sharedItems: [],
  sharedLoading: false,
}

describe('DocumentRoute', () => {
  afterEach(cleanup)
  beforeEach(() => useDrive.mockReset())

  it('scopes the viewer to the folder encoded in the URL', () => {
    useDrive.mockReturnValue(drive)
    render(<DocumentRoute folderSlug="zentio" slug="contract" />)
    expect(
      screen.getByText('Viewer for zentio/contract via org-zentio:contract'),
    ).not.toBeNull()
  })

  it('opens a document shared on its own by its id', () => {
    useDrive.mockReturnValue({
      ...drive,
      sharedItems: [
        {
          type: 'artifact',
          folderSlug: 'acme',
          artifact: { id: 'doc-1', slug: 'contract' },
        },
      ],
    })
    render(<DocumentRoute folderSlug="acme" slug="contract" />)
    expect(
      screen.getByText('Viewer for acme/contract via id:doc-1'),
    ).not.toBeNull()
  })

  it('asks for access to anything else', () => {
    useDrive.mockReturnValue(drive)
    render(<DocumentRoute folderSlug="acme" slug="contract" />)
    expect(screen.getByText('You need access')).not.toBeNull()
  })
})
