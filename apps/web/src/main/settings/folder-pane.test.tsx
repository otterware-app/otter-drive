// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FolderPane } from './folder-pane'

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))
vi.mock('../folder-role', () => ({
  useFolderRole: () => ({ canManage: true, canEdit: true, isOwner: true }),
}))
vi.mock('../drive/folder-rail', () => ({ useCanCreateFolders: () => false }))
vi.mock('../folders', () => ({
  announceFoldersChanged: vi.fn(),
  driveForFolder: () => null,
  folderLabel: (folder: { name: string }) => folder.name,
  useFolders: () => ({
    activeFolder: {
      id: 'org-zentio',
      name: 'Zentio',
      slug: 'zentio',
      role: 'owner',
    },
    folders: [
      { id: 'org-chris', name: 'chris', slug: 'chris' },
      { id: 'org-zentio', name: 'Zentio', slug: 'zentio', role: 'owner' },
    ],
    selectFolder: vi.fn(),
  }),
}))
vi.mock('#/lib/auth-client', () => ({
  authClient: { folder: { update: vi.fn() } },
}))

describe('FolderPane', () => {
  it('shows the current folder name', async () => {
    render(<FolderPane />)
    expect(
      (screen.getByRole('textbox', { name: 'Folder name' }) as HTMLInputElement)
        .value,
    ).toBe('Zentio')
  })
})
