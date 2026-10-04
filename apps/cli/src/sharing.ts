import {
  sharedWithMeResponseSchema,
  sharingResponseSchema,
  type ShareRole,
  type Sharing,
  type SharingResponse,
} from '@otterware/contracts'
import type { Command } from 'commander'
import pc from 'picocolors'
import { ApiClient } from './client'
import { getProfile } from './config'
import { resolveFolderReference, type Folder } from './folders'
import type { GlobalOptions } from './output'
import { note, printJson, success, table } from './output'

/**
 * Sharing from the command line, as in the web app's Share dialog: add
 * people by email as viewers or editors, remove them, turn "anyone with the
 * link" on or off, and list what's shared with you. Sharing acts as you, so
 * it needs a user login rather than an API key.
 */

type Kind = 'artifact' | 'folder'

function globals(command: Command): GlobalOptions {
  return command.optsWithGlobals<GlobalOptions>()
}

async function userClient(command: Command): Promise<ApiClient> {
  const { profile } = await getProfile(globals(command).profile)
  if (!profile.accessToken || profile.apiKey) {
    throw new Error('Sharing requires a user login, not an API key.')
  }
  return new ApiClient(profile)
}

export function parseRole(value: string): ShareRole {
  if (value === 'viewer' || value === 'editor') return value
  throw new Error('The role must be "viewer" or "editor".')
}

/** The sharing endpoint of an artifact (ID or slug) or a folder (ID, slug or name). */
async function sharingPath(
  client: ApiClient,
  kind: Kind,
  reference: string,
): Promise<string> {
  if (kind === 'artifact')
    return `/api/v1/artifacts/${encodeURIComponent(reference)}/sharing`
  const { data: folders } = await client.get<{ data: Folder[] }>(
    '/api/v1/folders',
  )
  const folder = resolveFolderReference(folders, reference)
  return `/api/v1/folders/${encodeURIComponent(folder.id)}/sharing`
}

export function accessRows(sharing: Sharing) {
  return [
    {
      person: sharing.owner.name ?? sharing.owner.email,
      email: sharing.owner.email,
      access: 'owner',
      via: '',
    },
    ...(sharing.drive.kind === 'shared' &&
    sharing.resource.folderKind !== 'shared'
      ? [
          {
            person: `Members of ${sharing.drive.name}`,
            email: '',
            access: `${sharing.drive.memberCount} people`,
            via: 'shared drive',
          },
        ]
      : []),
    ...sharing.people.map((entry) => ({
      person: entry.name ?? entry.email,
      email: entry.email,
      access: entry.role,
      via: entry.inheritedFrom
        ? `from ${entry.inheritedFrom.name}`
        : entry.viaLink
          ? 'link'
          : entry.userId
            ? ''
            : 'not signed in yet',
    })),
  ]
}

function printSharing(command: Command, response: SharingResponse) {
  if (globals(command).json) return printJson(response)
  table(accessRows(response.data))
  const link = response.data.link
  if (link)
    note(
      `Anyone with the link can ${link.role === 'editor' ? 'edit' : 'view'}: ${link.url}`,
    )
  else note('Only people with access can open it.')
}

function registerOn(parent: Command, kind: Kind) {
  const what =
    kind === 'artifact'
      ? 'Artifact ID or slug'
      : 'Folder ID, slug, or unique name'

  parent
    .command('share')
    .argument(`<${kind}>`, what)
    .argument('<emails...>', 'Email addresses to share with')
    .option('--role <role>', 'viewer or editor', 'viewer')
    .option('--no-notify', 'Do not email them')
    .option('--message <text>', 'A note for the email')
    .description(
      `Share ${kind === 'artifact' ? 'an artifact' : 'a folder and everything in it'} with people`,
    )
    .action(
      async (
        reference: string,
        emails: string[],
        options: { role: string; notify: boolean; message?: string },
        command: Command,
      ) => {
        const client = await userClient(command)
        const path = await sharingPath(client, kind, reference)
        const response = sharingResponseSchema.parse(
          await client.post(`${path}/people`, {
            emails,
            role: parseRole(options.role),
            notify: options.notify,
            ...(options.message ? { message: options.message } : {}),
          }),
        )
        if (globals(command).json) return printJson(response)
        success(
          `Shared ${pc.bold(response.data.resource.name)} with ${emails.join(', ')} as ${options.role}${response.notified ? ', and emailed them' : ''}.`,
        )
      },
    )

  parent
    .command('unshare')
    .argument(`<${kind}>`, what)
    .argument('<email>', 'Email address to remove')
    .description('Remove someone’s access')
    .action(
      async (
        reference: string,
        email: string,
        _options: unknown,
        command: Command,
      ) => {
        const client = await userClient(command)
        const path = await sharingPath(client, kind, reference)
        const current = sharingResponseSchema.parse(await client.get(path)).data
        const entry = current.people.find(
          (item) => item.email === email.toLowerCase() && !item.inheritedFrom,
        )
        if (!entry) {
          const inherited = current.people.find(
            (item) => item.email === email.toLowerCase(),
          )
          throw new Error(
            inherited?.inheritedFrom
              ? `${email} has access from “${inherited.inheritedFrom.name}”. Remove it there.`
              : `${email} has no access here.`,
          )
        }
        const response = await client.delete<unknown>(
          `${path}/people/${encodeURIComponent(entry.id)}`,
        )
        if (globals(command).json) return printJson(response ?? { data: null })
        success(`Removed ${email} from ${pc.bold(current.resource.name)}.`)
      },
    )

  parent
    .command('access')
    .argument(`<${kind}>`, what)
    .description('Show who has access')
    .action(async (reference: string, _options: unknown, command: Command) => {
      const client = await userClient(command)
      const path = await sharingPath(client, kind, reference)
      printSharing(command, sharingResponseSchema.parse(await client.get(path)))
    })

  parent
    .command('link')
    .argument(`<${kind}>`, what)
    .option('--role <role>', 'viewer or editor', 'viewer')
    .option(
      '--off',
      'Turn the link off; people who joined through it lose access',
    )
    .description('Let anyone who signs in with the link open it')
    .action(
      async (
        reference: string,
        options: { role: string; off?: boolean },
        command: Command,
      ) => {
        const client = await userClient(command)
        const path = await sharingPath(client, kind, reference)
        const response = sharingResponseSchema.parse(
          options.off
            ? await client.delete(`${path}/link`)
            : await client.put(`${path}/link`, {
                role: parseRole(options.role),
              }),
        )
        if (globals(command).json) return printJson(response)
        if (response.data.link) {
          success(
            `Anyone with the link can ${response.data.link.role === 'editor' ? 'edit' : 'view'} ${pc.bold(response.data.resource.name)}.`,
          )
          process.stdout.write(`${response.data.link.url}\n`)
        } else
          success(
            `Only people with access can open ${pc.bold(response.data.resource.name)}.`,
          )
      },
    )
}

export function registerSharingCommands(program: Command): void {
  for (const [name, kind] of [
    ['artifacts', 'artifact'],
    ['folders', 'folder'],
  ] as const) {
    const parent = program.commands.find((command) => command.name() === name)
    if (!parent)
      throw new Error(`The ${name} command must be registered first.`)
    registerOn(parent, kind)
  }

  program
    .command('shared')
    .description('List folders and artifacts shared with you')
    .action(async (_options: unknown, command: Command) => {
      const client = await userClient(command)
      const result = sharedWithMeResponseSchema.parse(
        await client.get('/api/v1/shared'),
      )
      if (globals(command).json) return printJson(result)
      table(
        result.data.map((item) => ({
          type: item.type,
          name: item.folder?.name ?? item.artifact?.title,
          id: item.folder?.id ?? item.artifact?.id,
          access: item.role,
          'shared by': item.sharedBy?.name ?? item.sharedBy?.email ?? '',
          url: item.artifact?.url ?? '',
        })),
      )
    })
}
