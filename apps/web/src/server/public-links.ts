import {
  linkPreviewResponseSchema,
  sharedLinkResponseSchema,
  type LinkDocument,
  type LinkFolder,
} from '@otterware/contracts'
import { linkOpensDocument } from './access'
import { versionArchive, versionFile } from './artifacts'
import { signContentGrant } from './content'
import type { FolderRow } from './folders'
import { HttpError, json } from './http'
import { folderChain } from './sharing'
import type { Env } from './types'

/**
 * "Anyone with the link", without signing in: whoever holds a link views
 * what it shares, read-only (`/s/:token`). Signing in instead adds you to it
 * (`acceptLink`), which is how a link's editors edit.
 */

interface LinkRow {
  id: string
  folder_id: string | null
  artifact_id: string | null
}

interface DocumentRow {
  id: string
  slug: string
  title: string
  folder_id: string
  updated_at: string
  version_id: string
  version_number: number
  entry_path: string
  byte_size: number
}

const DOCUMENT_COLUMNS = `a.id, a.slug, a.title, a.folder_id, a.updated_at,
  v.id AS version_id, v.number AS version_number, v.entry_path,
  v.byte_size`

/** At most this many documents show in a folder opened by link. */
const FOLDER_LIMIT = 500

function linkGone(): HttpError {
  return new HttpError(
    404,
    'link_not_found',
    'This link no longer works. Ask the owner for access.',
  )
}

function mapDocument(row: DocumentRow): LinkDocument {
  return {
    id: row.id,
    title: row.title,
    updatedAt: row.updated_at,
    version: {
      number: row.version_number,
      entryPath: row.entry_path,
      byteSize: row.byte_size,
    },
  }
}

function mapFolder(row: Pick<FolderRow, 'id' | 'name'>): LinkFolder {
  return { id: row.id, name: row.name }
}

async function linkByToken(env: Env, token: string): Promise<LinkRow> {
  const link = await env.DB.prepare(
    'SELECT id, folder_id, artifact_id FROM share_link WHERE token = ?',
  )
    .bind(token)
    .first<LinkRow>()
  if (!link) throw linkGone()
  return link
}

/** A document the link opens, at its current version. */
async function linkDocument(
  env: Env,
  link: LinkRow,
  id: string,
): Promise<DocumentRow> {
  const row = (await linkOpensDocument(env, link.id, id))
    ? await env.DB.prepare(
        `SELECT ${DOCUMENT_COLUMNS} FROM artifact a
           JOIN artifact_version v ON v.id = a.current_version_id
          WHERE a.id = ?`,
      )
        .bind(id)
        .first<DocumentRow>()
    : null
  if (!row)
    throw new HttpError(
      404,
      'artifact_not_found',
      'This document was removed or is no longer shared.',
    )
  return row
}

/** A folder link's folder, or one inside it, with the path down to it. */
async function linkFolder(env: Env, link: LinkRow, folderId: string) {
  const chain = await folderChain(env, folderId).catch(() => [])
  const top = chain.findIndex((folder) => folder.id === link.folder_id)
  if (top < 0)
    throw new HttpError(404, 'folder_not_found', 'This folder isn’t shared.')
  const path = chain.slice(0, top + 1).reverse()
  const folder = path.at(-1)!
  const [folders, documents] = await Promise.all([
    env.DB.prepare(
      `SELECT id, name FROM folder WHERE parent_id = ?
        ORDER BY name COLLATE NOCASE`,
    )
      .bind(folder.id)
      .all<Pick<FolderRow, 'id' | 'name'>>(),
    env.DB.prepare(
      `SELECT ${DOCUMENT_COLUMNS} FROM artifact a
         JOIN artifact_version v ON v.id = a.current_version_id
        WHERE a.folder_id = ? AND a.state = 'published'
          AND a.archived_at IS NULL
        ORDER BY a.updated_at DESC LIMIT ?`,
    )
      .bind(folder.id, FOLDER_LIMIT)
      .all<DocumentRow>(),
  ])
  return {
    ...mapFolder(folder),
    path: path.map(mapFolder),
    folders: folders.results.map(mapFolder),
    documents: documents.results.map(mapDocument),
  }
}

/** What a link shares; `?folder=` opens a folder inside a folder link. */
async function describeLink(request: Request, env: Env, link: LinkRow) {
  if (link.artifact_id) {
    const document = await linkDocument(env, link, link.artifact_id)
    return json(
      sharedLinkResponseSchema.parse({
        data: {
          type: 'artifact',
          name: document.title,
          folder: null,
          document: mapDocument(document),
        },
      }),
    )
  }
  const folder = await linkFolder(
    env,
    link,
    new URL(request.url).searchParams.get('folder') ?? link.folder_id!,
  )
  return json(
    sharedLinkResponseSchema.parse({
      data: {
        type: 'folder',
        name: folder.path[0]!.name,
        folder,
        document: null,
      },
    }),
  )
}

/**
 * A preview grant for a document the link opens. It names the link, so
 * turning the link off ends it too.
 */
async function previewDocument(env: Env, link: LinkRow, id: string) {
  const document = await linkDocument(env, link, id)
  const entry = await env.DB.prepare(
    'SELECT content_type FROM artifact_file WHERE version_id = ? AND path = ?',
  )
    .bind(document.version_id, document.entry_path)
    .first<{ content_type: string }>()
  if (!entry)
    throw new HttpError(404, 'file_not_found', 'Document entry file not found.')
  const token = await signContentGrant(env, {
    principal: { linkId: link.id },
    artifactId: document.id,
    versionId: document.version_id,
    entryPath: document.entry_path,
  })
  return json(
    linkPreviewResponseSchema.parse({
      data: {
        document: mapDocument(document),
        url: new URL(`/raw/session/${token}`, env.CONTENT_URL).toString(),
        expiresAt: new Date(Date.now() + 5 * 60 * 1_000).toISOString(),
        contentType: entry.content_type,
        resourceBaseUrl: new URL(
          `/raw/a/${document.id}/${document.version_id}/`,
          env.CONTENT_URL,
        ).toString(),
      },
    }),
  )
}

/**
 * `GET /links/:token[/documents/:id[/content|/download]]`, open to anyone:
 * no session or API key is needed or used.
 */
export async function openLink(
  request: Request,
  env: Env,
  token: string,
  rest: string[],
): Promise<Response> {
  const link = await linkByToken(env, token)
  if (!rest.length) return describeLink(request, env, link)
  const [section, id, action] = rest
  if (section === 'documents' && id && rest.length <= 3) {
    if (!action) return previewDocument(env, link, id)
    const document = await linkDocument(env, link, id)
    if (action === 'content') {
      const response = await versionFile(
        env,
        document.version_id,
        new URL(request.url).searchParams.get('path') ?? document.entry_path,
      )
      // The URL stays the same across versions and the link can be turned off.
      response.headers.set('cache-control', 'private, no-store')
      return response
    }
    if (action === 'download')
      return versionArchive(env, document.slug, {
        id: document.version_id,
        number: document.version_number,
      })
  }
  throw new HttpError(404, 'not_found', 'API endpoint not found.')
}
