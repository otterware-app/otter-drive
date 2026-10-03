import { createReadStream } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  artifactFilesResponseSchema,
  artifactListResponseSchema,
  artifactResponseSchema,
  artifactVersionsResponseSchema,
  completeUploadResponseSchema,
  createArtifactInputSchema,
  uploadSessionResponseSchema,
  type Artifact,
  type ArtifactFile,
  type CompleteUploadResponse,
} from '@otterware/contracts'
import type { Command } from 'commander'
import open from 'open'
import pc from 'picocolors'
import { ApiClient } from './client'
import { getProfile } from './config'
import { resolveFolderReference, type Folder } from './folders'
import {
  discoverFiles,
  resolveEntryPath,
  type LocalArtifactFile,
} from './files'
import type { GlobalOptions } from './output'
import { note, printJson, success, table } from './output'

interface ArtifactListOptions {
  archived?: boolean
  limit?: string
}

interface CreateOptions {
  description?: string
  entry?: string
  label?: string
  slug: string
  title: string
}

interface PushOptions {
  entry?: string
  ifVersion?: string
  label: string
}

interface VersionOptions {
  version?: string
}

interface PullOptions extends VersionOptions {
  force?: boolean
}

interface UpdateOptions {
  description?: string
  slug?: string
  title?: string
}

function globals(command: Command): GlobalOptions {
  return command.optsWithGlobals<GlobalOptions>()
}

async function clientFor(command: Command): Promise<ApiClient> {
  const { profile } = await getProfile(globals(command).profile)
  return new ApiClient(profile)
}

function versionQuery(version?: string): string {
  return version ? `?version=${encodeURIComponent(version)}` : ''
}

async function pooled<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++
        const item = items[index]
        if (item) await worker(item, index)
      }
    }),
  )
}

async function publishFiles(input: {
  artifact: Artifact
  client: ApiClient
  command: Command
  entryPath: string
  expectedCurrentVersion?: number | undefined
  files: LocalArtifactFile[]
  label: string
}): Promise<CompleteUploadResponse> {
  const { artifact, client, command, entryPath, files, label } = input
  const session = uploadSessionResponseSchema.parse(
    await client.post(`/api/v1/artifacts/${artifact.id}/uploads`, {
      label,
      entryPath,
      expectedCurrentVersion: input.expectedCurrentVersion,
      files: files.map(({ absolutePath: _absolutePath, ...file }) => file),
    }),
  ).data
  const byPath = new Map(files.map((file) => [file.path, file]))

  await pooled(session.files, 4, async (remote, index) => {
    const file = byPath.get(remote.path)
    if (!file)
      throw new Error(`Server requested an unknown file: ${remote.path}`)
    if (!globals(command).json) {
      note(`Uploading ${index + 1}/${files.length}: ${file.path}`)
    }
    if (remote.multipart) {
      if (!remote.partSize)
        throw new Error('Server omitted multipart part size')
      const count = Math.ceil(file.size / remote.partSize)
      const parts: Array<{ partNumber: number; etag: string }> = []
      await pooled(
        Array.from({ length: count }, (_, partIndex) => partIndex + 1),
        3,
        async (partNumber) => {
          const start = (partNumber - 1) * remote.partSize!
          const end = Math.min(file.size, start + remote.partSize!) - 1
          const uploadUrl = new URL(remote.uploadUrl)
          uploadUrl.searchParams.set('part', String(partNumber))
          const result = await client.request<{
            data: { partNumber: number; etag: string }
          }>(uploadUrl.toString(), {
            method: 'PUT',
            headers: {
              'content-length': String(end - start + 1),
              'content-type': file.contentType,
              'x-content-sha256': file.sha256,
            },
            body: createReadStream(file.absolutePath, { start, end }) as never,
            duplex: 'half',
          } as RequestInit & { duplex: 'half' })
          parts[partNumber - 1] = result.data
          if (!globals(command).json) {
            note(`  part ${partNumber}/${count}`)
          }
        },
      )
      await client.post(`${remote.uploadUrl}/complete`, { parts })
      return
    }
    await client.request<Response>(remote.uploadUrl, {
      method: 'PUT',
      headers: {
        'content-length': String(file.size),
        'content-type': file.contentType,
        'x-content-sha256': file.sha256,
      },
      body: createReadStream(file.absolutePath) as never,
      duplex: 'half',
      raw: true,
    } as RequestInit & { duplex: 'half'; raw: true })
  })

  return completeUploadResponseSchema.parse(
    await client.post(`/api/v1/uploads/${session.id}/complete`),
  )
}

function displayArtifact(artifact: Artifact): void {
  process.stdout.write(`${pc.bold(artifact.title)}\n`)
  process.stdout.write(`${artifact.id} · ${artifact.slug}\n`)
  process.stdout.write(
    `${artifact.versionCount} version${artifact.versionCount === 1 ? '' : 's'}\n`,
  )
  if (artifact.description) process.stdout.write(`${artifact.description}\n`)
  process.stdout.write(`${artifact.url}\n`)
}

export function registerArtifactCommands(program: Command): void {
  const artifacts = program
    .command('artifacts')
    .alias('artifact')
    .description('Create, publish, read, and manage artifacts')

  artifacts
    .command('list')
    .alias('ls')
    .description('List artifacts')
    .option('--archived', 'Include archived artifacts')
    .option('--limit <number>', 'Maximum results', '50')
    .action(async (options: ArtifactListOptions, command: Command) => {
      const query = new URLSearchParams({ limit: options.limit ?? '50' })
      if (options.archived) query.set('archived', 'true')
      const result = artifactListResponseSchema.parse(
        await (await clientFor(command)).get(`/api/v1/artifacts?${query}`),
      )
      if (globals(command).json) printJson(result)
      else {
        table(
          result.data.map((artifact) => ({
            id: artifact.id,
            slug: artifact.slug,
            title: artifact.title,
            status: artifact.archivedAt ? 'archived' : 'active',
            version: artifact.currentVersion?.number ?? '-',
            updated: artifact.updatedAt,
          })),
        )
      }
    })

  artifacts
    .command('show')
    .argument('<artifact>', 'Artifact ID or slug')
    .description('Show artifact metadata')
    .action(async (id: string, _options: unknown, command: Command) => {
      const result = artifactResponseSchema.parse(
        await (await clientFor(command)).get(`/api/v1/artifacts/${id}`),
      )
      if (globals(command).json) printJson(result)
      else displayArtifact(result.data)
    })

  artifacts
    .command('create')
    .argument('<path>', 'File or directory to publish as version 1')
    .requiredOption('--slug <slug>', 'URL slug')
    .requiredOption('--title <title>', 'Artifact title')
    .option('--description <description>', 'Artifact description', '')
    .option('--entry <path>', 'Entry file inside the artifact')
    .option('--label <label>', 'Version label', 'Initial version')
    .action(async (path: string, options: CreateOptions, command: Command) => {
      const client = await clientFor(command)
      const files = await discoverFiles(path)
      const entryPath = resolveEntryPath(files, options.entry)
      const metadata = createArtifactInputSchema.parse({
        slug: options.slug,
        title: options.title,
        description: options.description,
        entryPath,
        label: options.label,
      })
      const created = artifactResponseSchema.parse(
        await client.post('/api/v1/artifacts', metadata),
      ).data
      try {
        const result = await publishFiles({
          artifact: created,
          client,
          command,
          entryPath,
          files,
          label: metadata.label,
          expectedCurrentVersion: 0,
        })
        if (globals(command).json) printJson(result)
        else {
          success(`Created ${pc.bold(result.data.artifact.title)}.`)
          process.stdout.write(`${result.data.artifact.url}\n`)
        }
      } catch (error) {
        await client
          .delete(`/api/v1/artifacts/${created.id}/draft`)
          .catch(() => {})
        throw error
      }
    })

  artifacts
    .command('push')
    .argument('<artifact>', 'Artifact ID or slug')
    .argument('<path>', 'File or directory to publish')
    .requiredOption('--label <label>', 'Description of this version')
    .option('--entry <path>', 'Entry file inside the artifact')
    .option('--if-version <number>', 'Fail unless this is the current version')
    .action(
      async (
        id: string,
        path: string,
        options: PushOptions,
        command: Command,
      ) => {
        const client = await clientFor(command)
        const artifact = artifactResponseSchema.parse(
          await client.get(`/api/v1/artifacts/${id}`),
        ).data
        const files = await discoverFiles(path)
        const entryPath = resolveEntryPath(files, options.entry)
        const result = await publishFiles({
          artifact,
          client,
          command,
          entryPath,
          files,
          label: options.label,
          expectedCurrentVersion: options.ifVersion
            ? Number(options.ifVersion)
            : undefined,
        })
        if (globals(command).json) printJson(result)
        else {
          success(
            `Published ${pc.bold(artifact.title)} v${result.data.version.number}.`,
          )
          process.stdout.write(`${result.data.artifact.url}\n`)
        }
      },
    )

  artifacts
    .command('update')
    .argument('<artifact>', 'Artifact ID or slug')
    .description('Update metadata without creating a version')
    .option('--slug <slug>')
    .option('--title <title>')
    .option('--description <description>')
    .action(async (id: string, options: UpdateOptions, command: Command) => {
      const update = Object.fromEntries(
        Object.entries(options).filter(([, value]) => value !== undefined),
      )
      const result = artifactResponseSchema.parse(
        await (
          await clientFor(command)
        ).patch(`/api/v1/artifacts/${id}`, update),
      )
      if (globals(command).json) printJson(result)
      else success(`Updated ${pc.bold(result.data.title)}.`)
    })

  artifacts
    .command('move')
    .argument('<artifact>', 'Artifact ID or slug')
    .argument('<folder>', 'Destination folder ID, slug, or unique name')
    .description('Move an artifact to another folder')
    .action(async (id: string, folderRef: string, command: Command) => {
      const { profile } = await getProfile(globals(command).profile)
      if (!profile.accessToken || profile.apiKey) {
        throw new Error(
          'Moving artifacts requires a user login, not an API key.',
        )
      }
      const client = new ApiClient(profile)
      const { data: folders } = await client.get<{ data: Folder[] }>(
        '/api/v1/folders',
      )
      const destination = resolveFolderReference(folders, folderRef)
      const result = artifactResponseSchema.parse(
        await client.post(`/api/v1/artifacts/${id}/move`, {
          folderId: destination.id,
        }),
      )
      if (globals(command).json) printJson(result)
      else {
        success(
          `Moved ${pc.bold(result.data.title)} to ${pc.bold(destination.name)}.`,
        )
        process.stdout.write(`${result.data.url}\n`)
      }
    })

  artifacts
    .command('versions')
    .argument('<artifact>')
    .description('List immutable versions')
    .action(async (id: string, _options: unknown, command: Command) => {
      const result = artifactVersionsResponseSchema.parse(
        await (
          await clientFor(command)
        ).get(`/api/v1/artifacts/${id}/versions`),
      )
      if (globals(command).json) printJson(result)
      else
        table(
          result.data.map((version) => ({
            version: version.number,
            label: version.label,
            files: version.fileCount,
            bytes: version.byteSize,
            created: version.createdAt,
            by: version.createdBy?.name ?? '-',
          })),
        )
    })

  artifacts
    .command('files')
    .argument('<artifact>')
    .option('--version <number>')
    .description('List files in a version')
    .action(async (id: string, options: VersionOptions, command: Command) => {
      const result = artifactFilesResponseSchema.parse(
        await (
          await clientFor(command)
        ).get(`/api/v1/artifacts/${id}/files${versionQuery(options.version)}`),
      )
      if (globals(command).json) printJson(result)
      else
        table(
          result.data.map((file) => ({
            path: file.path,
            type: file.contentType,
            bytes: file.size,
            sha256: file.sha256.slice(0, 12),
          })),
        )
    })

  artifacts
    .command('read')
    .argument('<artifact>')
    .argument('[path]', 'File path; defaults to the version entry')
    .option('--version <number>')
    .description('Write a file to standard output')
    .action(
      async (
        id: string,
        path: string | undefined,
        options: VersionOptions,
        command: Command,
      ) => {
        const query = new URLSearchParams()
        if (options.version) query.set('version', options.version)
        if (path) query.set('path', path)
        const response = await (
          await clientFor(command)
        ).request<Response>(`/api/v1/artifacts/${id}/content?${query}`, {
          raw: true,
        })
        process.stdout.write(Buffer.from(await response.arrayBuffer()))
      },
    )

  artifacts
    .command('pull')
    .argument('<artifact>')
    .argument('[destination]', 'Destination directory', '.')
    .option('--version <number>')
    .description('Download every file in a version')
    .action(
      async (
        id: string,
        destination: string,
        options: PullOptions,
        command: Command,
      ) => {
        const client = await clientFor(command)
        const files = artifactFilesResponseSchema.parse(
          await client.get(
            `/api/v1/artifacts/${id}/files${versionQuery(options.version)}`,
          ),
        ).data
        const root = resolve(destination)
        await pooled(files, 4, async (file: ArtifactFile) => {
          const target = resolve(root, file.path)
          if (!target.startsWith(`${root}/`) && target !== root) {
            throw new Error(`Unsafe file path returned by server: ${file.path}`)
          }
          const query = new URLSearchParams({ path: file.path })
          if (options.version) query.set('version', options.version)
          const response = await client.request<Response>(
            `/api/v1/artifacts/${id}/content?${query}`,
            { raw: true },
          )
          await mkdir(dirname(target), { recursive: true })
          await writeFile(target, Buffer.from(await response.arrayBuffer()))
          if (!globals(command).json) note(`Downloaded ${file.path}`)
        })
        if (globals(command).json) printJson({ destination: root, files })
        else success(`Downloaded ${files.length} files to ${root}.`)
      },
    )

  artifacts
    .command('open')
    .argument('<artifact>')
    .description('Open an artifact in the browser')
    .action(async (id: string, _options: unknown, command: Command) => {
      const artifact = artifactResponseSchema.parse(
        await (await clientFor(command)).get(`/api/v1/artifacts/${id}`),
      ).data
      await open(artifact.url)
      if (globals(command).json) printJson({ url: artifact.url })
      else note(artifact.url)
    })

  artifacts
    .command('promote')
    .argument('<artifact>')
    .requiredOption('--version <number>')
    .description('Make an existing immutable version current')
    .action(async (id: string, options: VersionOptions, command: Command) => {
      const result = artifactResponseSchema.parse(
        await (
          await clientFor(command)
        ).post(`/api/v1/artifacts/${id}/promote`, {
          version: Number(options.version),
        }),
      )
      if (globals(command).json) printJson(result)
      else
        success(
          `Promoted ${pc.bold(result.data.title)} to v${options.version}.`,
        )
    })

  for (const action of ['archive', 'restore'] as const) {
    artifacts
      .command(action)
      .argument('<artifact>')
      .description(
        `${action === 'archive' ? 'Archive' : 'Restore'} an artifact`,
      )
      .action(async (id: string, _options: unknown, command: Command) => {
        const client = await clientFor(command)
        const result = artifactResponseSchema.parse(
          action === 'archive'
            ? await client.delete(`/api/v1/artifacts/${id}`)
            : await client.post(`/api/v1/artifacts/${id}/restore`),
        )
        if (globals(command).json) printJson(result)
        else
          success(
            `${action === 'archive' ? 'Archived' : 'Restored'} ${pc.bold(result.data.title)}.`,
          )
      })
  }
}
