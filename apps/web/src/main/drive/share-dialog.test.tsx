// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Sharing } from '@otterware/contracts'
import { ShareDialogHost, requestShare } from './share-dialog'

const { api } = vi.hoisted(() => ({ api: vi.fn() }))
vi.mock('#/lib/api', () => ({ api }))
vi.mock('#/lib/auth-client', () => ({
  authClient: {
    useSession: () => ({
      data: { user: { id: 'chris', email: 'chris@example.com' } },
    }),
  },
}))
vi.mock('../folders', () => ({ announceSharingChanged: vi.fn() }))

const sharing: Sharing = {
  resource: {
    type: 'artifact',
    id: 'doc',
    name: 'Q3 roadmap',
    folderKind: null,
  },
  drive: { id: 'home', name: 'My Drive', kind: 'personal', memberCount: 1 },
  owner: {
    userId: 'chris',
    email: 'chris@example.com',
    name: 'Chris',
    image: null,
  },
  role: 'owner',
  canShare: true,
  people: [
    {
      id: 'share-1',
      userId: 'alex',
      email: 'alex@example.com',
      name: 'Alex',
      image: null,
      role: 'viewer',
      inheritedFrom: { id: 'projects', name: 'Projects' },
      viaLink: false,
    },
  ],
  link: null,
  inheritedLink: null,
}

function renderHost() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ShareDialogHost />
    </QueryClientProvider>,
  )
  act(() =>
    requestShare({
      type: 'artifact',
      id: 'doc',
      name: 'Q3 roadmap',
      url: 'http://drive.test/chris/a/q3-roadmap/',
    }),
  )
}

beforeEach(() => {
  api.mockReset()
  api.mockImplementation(async (path: string, init?: { method?: string }) =>
    path.startsWith('/api/v1/people')
      ? { data: [] }
      : {
          data: sharing,
          ...(init?.method === 'POST' ? { notified: true } : {}),
        },
  )
})
afterEach(cleanup)

describe('ShareDialog', () => {
  it('lists the owner and inherited access, read-only', async () => {
    renderHost()
    expect(await screen.findByText('Share “Q3 roadmap”')).not.toBeNull()
    expect(await screen.findByText('Owner')).not.toBeNull()
    expect(screen.getByText(/Access from “Projects”/)).not.toBeNull()
    // Inherited access changes on the folder, not here.
    expect(screen.queryByRole('button', { name: /^Viewer/ })).toBeNull()
    expect(screen.getByText('Restricted')).not.toBeNull()
  })

  it('shares with an address typed but not yet added', async () => {
    renderHost()
    const input = await screen.findByRole('combobox', {
      name: 'Add people by email',
    })
    fireEvent.change(input, { target: { value: 'Sam@Example.com' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Send' }))
    await vi.waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        '/api/v1/artifacts/doc/sharing/people',
        expect.objectContaining({ method: 'POST' }),
      ),
    )
    const post = api.mock.calls.find((call) => call[1]?.method === 'POST')!
    expect(JSON.parse(post[1].body as string)).toEqual({
      emails: ['sam@example.com'],
      role: 'editor',
      notify: true,
    })
  })

  it('turns typed addresses into chips and rejects what isn’t one', async () => {
    renderHost()
    const input = await screen.findByRole('combobox', {
      name: 'Add people by email',
    })
    fireEvent.change(input, { target: { value: 'not-an-email' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(await screen.findByRole('alert')).not.toBeNull()
    fireEvent.change(input, { target: { value: 'sam@example.com' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(
      await screen.findByRole('button', { name: 'Remove sam@example.com' }),
    ).not.toBeNull()
  })
})
