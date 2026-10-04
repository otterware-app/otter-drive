import { describe, expect, it } from 'vitest'
import {
  driveForFolder,
  folderLabel,
  folderPath,
  isInSharedFolder,
  type Folder,
} from './folders'

const folder = (
  id: string,
  parentId: string | null,
  kind: Folder['kind'] = parentId ? 'folder' : 'shared',
): Folder => ({
  id,
  name: id,
  slug: id,
  parentId,
  kind,
  ownerUserId: 'owner',
  role: 'owner',
})

describe('folders', () => {
  const mine = folder('chris', null, 'personal')
  const projects = folder('projects', 'chris')
  const q3 = folder('q3', 'projects')
  // Shared with you: its parent, in someone else's drive, isn't listed.
  const design = folder('design', 'someone-elses-drive')
  const assets = folder('assets', 'design')
  const folders = [mine, projects, q3, design, assets]

  it('calls the personal drive My Drive, whatever it was named', () => {
    expect(folderLabel(mine)).toBe('My Drive')
    expect(folderLabel(projects)).toBe('projects')
  })

  it('finds the drive, or the shared folder, at the top', () => {
    expect(driveForFolder(folders, q3)).toBe(mine)
    expect(driveForFolder(folders, assets)).toBe(design)
    expect(isInSharedFolder(folders, q3)).toBe(false)
    expect(isInSharedFolder(folders, assets)).toBe(true)
  })

  it('walks the path down from the top', () => {
    expect(folderPath(folders, q3).map((item) => item.id)).toEqual([
      'chris',
      'projects',
      'q3',
    ])
    expect(folderPath(folders, assets).map((item) => item.id)).toEqual([
      'design',
      'assets',
    ])
  })
})
