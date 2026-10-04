// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FolderRail } from './folder-rail'

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
vi.mock('./new-folder-dialog', () => ({ NewFolderDialog: () => null }))

const folders = [
  {
    id: 'org-1',
    name: 'Otter Drive Folder',
    slug: 'otterware',
    parentId: null,
    kind: 'personal' as const,
    ownerUserId: 'owner',
    role: 'owner' as const,
  },
  {
    id: 'org-2',
    name: 'Zentio',
    slug: 'zentio',
    parentId: null,
    kind: 'shared' as const,
    ownerUserId: 'owner',
    role: 'owner' as const,
  },
]

afterEach(cleanup)

describe('FolderRail', () => {
  it('lists the drives, lighting the one showing', () => {
    const onSelectFolder = vi.fn()
    render(
      <FolderRail
        folders={folders}
        currentFolderId="org-1"
        settingsOpen={false}
        onSelectFolder={onSelectFolder}
      />,
    )
    // The personal drive is always "My Drive", whatever it was called.
    expect(
      screen
        .getByRole('button', { name: 'My Drive' })
        .getAttribute('aria-current'),
    ).toBe('page')
    expect(screen.queryByRole('button', { name: 'Otter Drive Folder' })).toBe(
      null,
    )
    expect(
      screen
        .getByRole('button', { name: 'Zentio' })
        .getAttribute('aria-current'),
    ).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Zentio' }))
    expect(onSelectFolder).toHaveBeenCalledWith(folders[1])
  })

  it('lights Shared with me instead of a drive while it shows', () => {
    const onOpenShared = vi.fn()
    render(
      <FolderRail
        folders={folders}
        currentFolderId="org-1"
        settingsOpen={false}
        sharedOpen
        onSelectFolder={vi.fn()}
        onOpenShared={onOpenShared}
      />,
    )
    const shared = screen.getByRole('button', { name: 'Shared with me' })
    expect(shared.getAttribute('aria-current')).toBe('page')
    expect(
      screen
        .getByRole('button', { name: 'My Drive' })
        .getAttribute('aria-current'),
    ).toBeNull()
    fireEvent.click(shared)
    expect(onOpenShared).toHaveBeenCalled()
  })

  it('lets any signed-in person create a shared drive', () => {
    render(
      <FolderRail
        folders={folders}
        currentFolderId="org-1"
        settingsOpen={false}
        onSelectFolder={vi.fn()}
      />,
    )
    expect(
      screen.getByRole('button', { name: 'New shared drive' }),
    ).toBeTruthy()
  })

  it('opens the account menu with Settings and Sign out', async () => {
    render(
      <FolderRail
        folders={folders}
        currentFolderId="org-1"
        settingsOpen={false}
        onSelectFolder={vi.fn()}
      />,
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Account and settings' }),
    )
    expect(
      await screen.findByRole('menuitem', { name: 'Settings' }),
    ).toBeTruthy()
    expect(
      screen.getByRole('menuitem', { name: 'Sign out of Otter' }),
    ).toBeTruthy()
    expect(screen.getByText('chris@example.com')).toBeTruthy()
  })
})
