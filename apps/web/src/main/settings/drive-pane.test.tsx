// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DrivePane } from './drive-pane'

const drives = vi.hoisted(() => ({
  personal: {
    id: 'home_chris',
    name: 'My Drive',
    slug: 'home-chris',
    kind: 'personal',
    parentId: null,
    role: 'owner',
  },
  zentio: {
    id: 'zentio',
    name: 'Zentio',
    slug: 'zentio',
    kind: 'shared',
    parentId: null,
    role: 'owner',
  },
  active: 'zentio' as 'zentio' | 'personal',
}))

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))
vi.mock('../drive/folder-rail', () => ({ useCanCreateFolders: () => true }))
vi.mock('../folders', () => ({
  announceFoldersChanged: vi.fn(),
  driveForFolder: (_: unknown, folder: unknown) => folder,
  folderLabel: (folder: { kind: string; name: string }) =>
    folder.kind === 'personal' ? 'My Drive' : folder.name,
  folderColor: () => '#000',
  folderInitials: () => 'ZE',
  useFolders: () => ({
    activeFolder: drives[drives.active],
    folders: [drives.personal, drives.zentio],
    selectFolder: vi.fn(async () => undefined),
  }),
}))

afterEach(cleanup)

describe('DrivePane', () => {
  it('names the drive it applies to, and lets its owner rename it', () => {
    drives.active = 'zentio'
    render(<DrivePane />)
    expect(screen.getAllByText('Zentio').length).toBeGreaterThan(0)
    expect(
      (screen.getByRole('textbox', { name: 'Drive name' }) as HTMLInputElement)
        .value,
    ).toBe('Zentio')
    expect(screen.getByRole('button', { name: 'Delete drive…' })).toBeTruthy()
  })

  it('keeps My Drive’s name and can’t delete it', () => {
    drives.active = 'personal'
    render(<DrivePane />)
    expect(screen.queryByRole('textbox', { name: 'Drive name' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete drive…' })).toBeNull()
  })
})
