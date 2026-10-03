import type { Command } from 'commander'
import pc from 'picocolors'
import { ApiClient } from './client'
import { getProfile, updateProfile } from './config'
import type { GlobalOptions } from './output'
import { printJson, success, table } from './output'

export interface Folder {
  id: string
  name: string
  slug: string
  parentId?: string | null
  kind?: string
}

export function resolveFolderReference(
  folders: Folder[],
  reference: string,
): Folder {
  const normalized = reference.trim().toLowerCase()
  const exact = folders.find(
    (folder) =>
      folder.id === reference || folder.slug.toLowerCase() === normalized,
  )
  if (exact) return exact

  const byName = folders.filter(
    (folder) => folder.name.toLowerCase() === normalized,
  )
  if (byName.length === 1) return byName[0]!
  if (byName.length > 1) {
    throw new Error(
      `More than one folder is named "${reference}". Use its ID or slug.`,
    )
  }
  throw new Error(`Folder "${reference}" was not found.`)
}

function globals(command: Command): GlobalOptions {
  return command.optsWithGlobals<GlobalOptions>()
}

export function registerFolderCommands(program: Command): void {
  const folders = program
    .command('folders')
    .alias('drives')
    .description('Manage folders and the active workspace')

  folders
    .command('list')
    .alias('ls')
    .action(async (_options: unknown, command: Command) => {
      const { profile } = await getProfile(globals(command).profile)
      const { data: result } = await new ApiClient(profile).get<{
        data: Folder[]
      }>('/api/v1/folders')
      if (globals(command).json) printJson({ data: result })
      else
        table(
          result.map((folder) => ({
            active: folder.id === profile.folderId ? 'yes' : '',
            id: folder.id,
            slug: folder.slug,
            name: folder.name,
          })),
        )
    })

  folders
    .command('create')
    .argument('<name>')
    .option('--shared', 'Create a shared drive instead of a subfolder')
    .option('--parent <id>', 'Parent folder; defaults to the selected folder')
    .action(
      async (
        name: string,
        options: { shared?: boolean; parent?: string },
        command: Command,
      ) => {
        const current = await getProfile(globals(command).profile)
        const client = new ApiClient(current.profile)
        const me = await client.get<{ data: { folderId: string } }>(
          '/api/v1/me',
        )
        const { data: folder } = await client.post<{ data: Folder }>(
          '/api/v1/folders',
          {
            name,
            kind: options.shared ? 'shared' : 'folder',
            ...(options.shared
              ? {}
              : { parentId: options.parent ?? me.data.folderId }),
          },
        )
        await updateProfile(current.name, {
          folderId: folder.id,
        })
        if (globals(command).json) printJson({ data: folder })
        else success(`Created and selected ${pc.bold(folder.name)}.`)
      },
    )

  folders
    .command('use')
    .argument('<folder>', 'Folder ID, slug, or unique name')
    .action(async (reference: string, _options: unknown, command: Command) => {
      const current = await getProfile(globals(command).profile)
      const { data: folders } = await new ApiClient(current.profile).get<{
        data: Folder[]
      }>('/api/v1/folders')
      const folder = resolveFolderReference(folders, reference)
      const folderId = folder.id
      const client = new ApiClient({ ...current.profile, folderId })
      const me = await client.get<{ data: { folderId: string } }>('/api/v1/me')
      if (me.data.folderId !== folderId) {
        throw new Error('The selected folder was not accepted by the server.')
      }
      await updateProfile(current.name, { folderId })
      if (globals(command).json) printJson({ data: { folderId } })
      else success(`Selected folder ${pc.bold(folder.name)}.`)
    })
}
