import {
  artifactResponseSchema,
  completeUploadResponseSchema,
  uploadSessionResponseSchema,
  type Artifact,
} from '@otterware/contracts'
import { api } from '#/lib/api'

const MULTIPART_PART_SIZE = 50 * 1024 * 1024

export interface PickedFile {
  file: File
  path: string
}

const mimeByExtension: Record<string, string> = {
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  mjs: 'text/javascript',
  json: 'application/json',
  md: 'text/markdown',
  txt: 'text/plain',
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  ogv: 'video/ogg',
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  woff: 'font/woff',
  woff2: 'font/woff2',
}

function contentTypeFor(file: File, path: string): string {
  if (file.type) return file.type
  const extension = path.split('.').pop()?.toLowerCase() ?? ''
  return mimeByExtension[extension] ?? 'application/octet-stream'
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export function pickEntryPath(files: PickedFile[]): string {
  if (files.length === 1) return files[0]!.path
  const paths = files.map((file) => file.path)
  return (
    paths.find((path) => path === 'index.html') ??
    paths.find((path) => path.endsWith('/index.html')) ??
    paths.find((path) => /\.html?$/.test(path)) ??
    paths[0]!
  )
}

export function relativePaths(list: FileList): PickedFile[] {
  const files = Array.from(list).map((file) => ({
    file,
    path: file.webkitRelativePath || file.name,
  }))
  // A folder pick prefixes every path with the folder name; strip it so the
  // entry path is `index.html`, not `dist/index.html`.
  const root = files[0]?.path.split('/')[0]
  const folderPick =
    files.length > 0 &&
    files.every(
      (file) => file.path.includes('/') && file.path.startsWith(`${root}/`),
    )
  return folderPick
    ? files.map((file) => ({
        ...file,
        path: file.path.slice(root!.length + 1),
      }))
    : files
}

async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

/** Splits a title out of a file or folder name: `q3-report.pdf` -> `q3 report`. */
export function titleFromName(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .trim()
}

/**
 * Creates a document and publishes `files` as its first version. When
 * `retryTakenSlug` is set, a taken slug is retried once with a short suffix.
 */
export async function uploadDocument({
  folderId,
  files,
  title,
  slug,
  retryTakenSlug = false,
  onStatus,
}: {
  folderId: string
  files: PickedFile[]
  title: string
  slug: string
  retryTakenSlug?: boolean
  onStatus?: (status: string) => void
}): Promise<Artifact> {
  const entryPath = pickEntryPath(files)
  let artifactId: string | null = null
  try {
    onStatus?.('Preparing files…')
    const manifest = await Promise.all(
      files.map(async ({ file, path }) => ({
        path,
        contentType: contentTypeFor(file, path),
        size: file.size,
        sha256: await sha256(file),
      })),
    )
    onStatus?.('Creating document…')
    const createDocument = async (documentSlug: string) =>
      artifactResponseSchema.parse(
        await api<unknown>('/api/v1/artifacts', {
          method: 'POST',
          folderId,
          body: JSON.stringify({
            slug: documentSlug,
            title,
            entryPath,
            label: 'Initial version',
          }),
        }),
      ).data
    let created: Artifact
    try {
      created = await createDocument(slug)
    } catch (reason) {
      const taken =
        reason instanceof Error &&
        reason.message.includes('slug already exists')
      if (!retryTakenSlug || !taken) throw reason
      const suffix = crypto.randomUUID().slice(0, 4)
      created = await createDocument(`${slug.slice(0, 75)}-${suffix}`)
    }
    artifactId = created.id
    const session = uploadSessionResponseSchema.parse(
      await api<unknown>(
        `/api/v1/artifacts/${encodeURIComponent(created.id)}/uploads`,
        {
          method: 'POST',
          folderId,
          body: JSON.stringify({
            label: 'Initial version',
            entryPath,
            files: manifest,
          }),
        },
      ),
    ).data
    const byPath = new Map(files.map((item) => [item.path, item.file]))
    const hashByPath = new Map(manifest.map((item) => [item.path, item]))
    let done = 0
    for (const remote of session.files) {
      const file = byPath.get(remote.path)
      const meta = hashByPath.get(remote.path)
      if (!file || !meta) throw new Error(`Unexpected file: ${remote.path}`)
      onStatus?.(`Uploading ${++done}/${session.files.length}: ${remote.path}`)
      const headers = {
        'content-type': meta.contentType,
        'x-content-sha256': meta.sha256,
        'x-otterdrive-folder': folderId,
      }
      if (remote.multipart) {
        const partSize = remote.partSize ?? MULTIPART_PART_SIZE
        const count = Math.ceil(file.size / partSize)
        const parts: Array<{ partNumber: number; etag: string }> = []
        for (let partNumber = 1; partNumber <= count; partNumber += 1) {
          const url = new URL(remote.uploadUrl)
          url.searchParams.set('part', String(partNumber))
          const result = await api<{
            data: { partNumber: number; etag: string }
          }>(url.toString(), {
            method: 'PUT',
            headers,
            body: file.slice(
              (partNumber - 1) * partSize,
              partNumber * partSize,
            ),
          })
          parts.push(result.data)
        }
        await api<unknown>(`${remote.uploadUrl}/complete`, {
          method: 'POST',
          folderId,
          body: JSON.stringify({ parts }),
        })
      } else {
        await api<void>(remote.uploadUrl, {
          method: 'PUT',
          headers,
          body: file,
        })
      }
    }
    onStatus?.('Publishing…')
    return completeUploadResponseSchema.parse(
      await api<unknown>(
        `/api/v1/uploads/${encodeURIComponent(session.id)}/complete`,
        { method: 'POST', folderId },
      ),
    ).data.artifact
  } catch (reason) {
    if (artifactId) {
      await api<void>(
        `/api/v1/artifacts/${encodeURIComponent(artifactId)}/draft`,
        { method: 'DELETE', folderId },
      ).catch(() => undefined)
    }
    throw reason
  }
}
