import { HttpError } from './http'
import { artifactAccess } from './access'
import type { Env } from './types'
import { storageFor } from './storage'

interface GrantPayload {
  principal: { userId: string; keyId?: string } | { service: true }
  artifactId: string
  versionId: string
  entryPath: string
  expiresAt: number
  nonce: string
}

interface ThumbnailGrantPayload {
  r2Key: string
  expiresAt: number
}

interface ContentFileRow {
  path: string
  content_type: string
  size: number
  r2_key: string
  storage_backend_id: string | null
}

const encoder = new TextEncoder()

/** How long a grant in a preview URL lasts: long enough to open it. */
const GRANT_SECONDS = 5 * 60
/**
 * How long the content cookie lasts once a preview is open. A video keeps
 * requesting ranges while it plays and seeks, so this outlives the URL grant.
 */
const SESSION_SECONDS = 4 * 60 * 60

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
  const binary = atob(normalized)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

async function signingKey(env: Env): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(env.CONTENT_SIGNING_KEY),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

export async function signContentGrant(
  env: Env,
  input: Omit<GrantPayload, 'expiresAt' | 'nonce'>,
  seconds = GRANT_SECONDS,
): Promise<string> {
  const payload: GrantPayload = {
    ...input,
    expiresAt: Math.floor(Date.now() / 1_000) + seconds,
    nonce: crypto.randomUUID(),
  }
  const body = base64Url(encoder.encode(JSON.stringify(payload)))
  const signature = await crypto.subtle.sign(
    'HMAC',
    await signingKey(env),
    encoder.encode(body),
  )
  return `${body}.${base64Url(new Uint8Array(signature))}`
}

export async function signThumbnailGrant(
  env: Env,
  r2Key: string,
): Promise<string> {
  const payload: ThumbnailGrantPayload = {
    r2Key,
    expiresAt: (Math.floor(Date.now() / 300_000) + 2) * 300,
  }
  const body = base64Url(encoder.encode(JSON.stringify(payload)))
  const signature = await crypto.subtle.sign(
    'HMAC',
    await signingKey(env),
    encoder.encode(body),
  )
  return `${body}.${base64Url(new Uint8Array(signature))}`
}

async function verifyContentGrant(
  env: Env,
  token: string,
): Promise<GrantPayload> {
  const [body, signature] = token.split('.')
  if (!body || !signature) {
    throw new HttpError(401, 'invalid_grant', 'Invalid content grant.')
  }
  const valid = await crypto.subtle.verify(
    'HMAC',
    await signingKey(env),
    decodeBase64Url(signature) as unknown as BufferSource,
    encoder.encode(body),
  )
  if (!valid)
    throw new HttpError(401, 'invalid_grant', 'Invalid content grant.')
  const payload = JSON.parse(
    new TextDecoder().decode(decodeBase64Url(body)),
  ) as GrantPayload
  if (payload.expiresAt < Math.floor(Date.now() / 1_000)) {
    throw new HttpError(401, 'expired_grant', 'The content grant expired.')
  }
  if (!payload.principal)
    throw new HttpError(
      401,
      'invalid_grant',
      'Reopen this document to refresh access.',
    )
  return payload
}

async function assertGrantAccess(env: Env, grant: GrantPayload) {
  if ('service' in grant.principal) return
  const { userId, keyId } = grant.principal
  const row = await env.DB.prepare(
    `SELECT a.folder_id FROM artifact a JOIN user u ON u.id=? WHERE a.id=? AND coalesce(u.banned,0)=0`,
  )
    .bind(userId, grant.artifactId)
    .first<{ folder_id: string }>()
  if (!row)
    throw new HttpError(403, 'access_revoked', 'Document access was removed.')
  let keyScope: string | null = null
  if (keyId) {
    const key = await env.DB.prepare(
      'SELECT metadata,permissions FROM apikey WHERE id=? AND referenceId=? AND enabled=1 AND (expiresAt IS NULL OR expiresAt>?)',
    )
      .bind(keyId, userId, new Date().toISOString())
      .first<{ metadata: string | null; permissions: string }>()
    if (!key || !JSON.parse(key.permissions).artifact?.includes('read'))
      throw new HttpError(403, 'access_revoked', 'API key access was removed.')
    keyScope = key.metadata ? (JSON.parse(key.metadata).folderId ?? null) : null
  }
  const role = await artifactAccess(
    env,
    { userId, keyScopeId: keyScope },
    { id: grant.artifactId, folder_id: row.folder_id },
  )
  if (!role)
    throw new HttpError(403, 'access_revoked', 'Document access was removed.')
}

async function verifyThumbnailGrant(
  env: Env,
  token: string,
): Promise<ThumbnailGrantPayload> {
  const [body, signature] = token.split('.')
  if (!body || !signature) {
    throw new HttpError(401, 'invalid_grant', 'Invalid thumbnail grant.')
  }
  const valid = await crypto.subtle.verify(
    'HMAC',
    await signingKey(env),
    decodeBase64Url(signature) as unknown as BufferSource,
    encoder.encode(body),
  )
  if (!valid)
    throw new HttpError(401, 'invalid_grant', 'Invalid thumbnail grant.')
  const payload = JSON.parse(
    new TextDecoder().decode(decodeBase64Url(body)),
  ) as ThumbnailGrantPayload
  if (payload.expiresAt < Math.floor(Date.now() / 1_000)) {
    throw new HttpError(401, 'expired_grant', 'The thumbnail grant expired.')
  }
  return payload
}

function assertContentOrigin(request: Request, env: Env): void {
  const actual = new URL(request.url)
  const expected = new URL(env.CONTENT_URL)
  const local = ['localhost', '127.0.0.1'].includes(actual.hostname)
  if (!local && actual.host !== expected.host) {
    throw new HttpError(404, 'not_found', 'Content endpoint not found.')
  }
}

function contentCookie(request: Request): string | null {
  const cookie = request.headers.get('cookie') ?? ''
  for (const part of cookie.split(';')) {
    const [name, ...value] = part.trim().split('=')
    if (name === 'otw_content') return value.join('=')
  }
  return null
}

export async function startContentSession(
  request: Request,
  env: Env,
  token: string,
): Promise<Response> {
  assertContentOrigin(request, env)
  const grant = await verifyContentGrant(env, token)
  await assertGrantAccess(env, grant)
  const sessionSeconds =
    'service' in grant.principal ? GRANT_SECONDS : SESSION_SECONDS
  const session = await signContentGrant(
    env,
    {
      principal: grant.principal,
      artifactId: grant.artifactId,
      versionId: grant.versionId,
      entryPath: grant.entryPath,
    },
    sessionSeconds,
  )
  const destination = new URL(
    `/raw/a/${grant.artifactId}/${grant.versionId}/${grant.entryPath}`,
    env.CONTENT_URL,
  )
  const headers = new Headers({
    location: destination.toString(),
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
  })
  const secure = env.CONTENT_URL.startsWith('https://') ? '; Secure' : ''
  headers.append(
    'set-cookie',
    `otw_content=${session}; Path=/raw/a/${grant.artifactId}/${grant.versionId}/; HttpOnly; SameSite=Lax; Max-Age=${sessionSeconds}${secure}`,
  )
  return new Response(null, { status: 302, headers })
}

/**
 * The byte range a `Range` header asks for. `null` serves the whole file:
 * no header, one we don't understand, or several ranges at once.
 */
export function requestedRange(
  header: string | null,
  size: number,
): { offset: number; length: number } | 'unsatisfiable' | null {
  const match = header?.trim().match(/^bytes=(\d*)-(\d*)$/)
  if (!match) return null
  const [, start = '', end = ''] = match
  if (!start && !end) return null
  if (!start) {
    const suffix = Number(end)
    if (suffix === 0 || size === 0) return 'unsatisfiable'
    const length = Math.min(suffix, size)
    return { offset: size - length, length }
  }
  const offset = Number(start)
  const last = end ? Number(end) : size - 1
  if (offset >= size) return 'unsatisfiable'
  if (last < offset) return null
  return { offset, length: Math.min(last, size - 1) - offset + 1 }
}

export async function serveRawContent(
  request: Request,
  env: Env,
  artifactId: string,
  versionId: string,
  path: string,
): Promise<Response> {
  assertContentOrigin(request, env)
  const token = contentCookie(request)
  if (!token)
    throw new HttpError(
      401,
      'content_login_required',
      'Content grant required.',
    )
  const grant = await verifyContentGrant(env, token)
  await assertGrantAccess(env, grant)
  if (grant.artifactId !== artifactId || grant.versionId !== versionId) {
    throw new HttpError(
      403,
      'grant_scope_mismatch',
      'Content grant scope mismatch.',
    )
  }
  const file = await env.DB.prepare(
    `SELECT path, content_type, size, r2_key, storage_backend_id FROM artifact_file
     WHERE version_id = ? AND path = ?`,
  )
    .bind(versionId, path)
    .first<ContentFileRow>()
  if (!file)
    throw new HttpError(404, 'file_not_found', 'Document file not found.')
  // Ranges let video and audio seek, and Safari won't play media without them.
  const range = requestedRange(request.headers.get('range'), file.size)
  if (range === 'unsatisfiable') {
    return new Response(null, {
      status: 416,
      headers: {
        'content-range': `bytes */${file.size}`,
        'accept-ranges': 'bytes',
      },
    })
  }
  const object = await (
    await storageFor(env, file.storage_backend_id)
  ).get(file.r2_key, range ?? undefined)
  if (!object)
    throw new HttpError(404, 'file_not_found', 'Document body not found.')
  const headers = new Headers({
    'content-type': file.content_type,
    'content-length': String(range ? range.length : file.size),
    'accept-ranges': 'bytes',
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'cross-origin-resource-policy': 'same-site',
  })
  if (file.content_type.includes('text/html')) {
    headers.set(
      'content-security-policy',
      'sandbox allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-modals',
    )
  }
  if (!range) return new Response(object.body, { headers })
  headers.set(
    'content-range',
    `bytes ${range.offset}-${range.offset + range.length - 1}/${file.size}`,
  )
  return new Response(object.body, { status: 206, headers })
}

export async function serveThumbnail(
  request: Request,
  env: Env,
  token: string,
): Promise<Response> {
  assertContentOrigin(request, env)
  const grant = await verifyThumbnailGrant(env, token)
  if (!grant.r2Key.startsWith('previews/')) {
    throw new HttpError(401, 'invalid_grant', 'Invalid thumbnail grant.')
  }
  // previews/<artifact>/<version>.jpg: its version says where it's stored.
  const versionId = grant.r2Key.split('/')[2]?.replace(/\.jpg$/, '') ?? ''
  const version = await env.DB.prepare(
    'SELECT preview_storage_backend_id FROM artifact_version WHERE id = ? AND preview_r2_key = ?',
  )
    .bind(versionId, grant.r2Key)
    .first<{ preview_storage_backend_id: string | null }>()
  if (!version)
    throw new HttpError(404, 'thumbnail_not_found', 'Thumbnail not found.')
  const object = await (
    await storageFor(env, version.preview_storage_backend_id)
  ).get(grant.r2Key)
  if (!object)
    throw new HttpError(404, 'thumbnail_not_found', 'Thumbnail not found.')
  return new Response(object.body, {
    headers: {
      'content-type': object.contentType ?? 'image/jpeg',
      'content-length': String(object.size),
      'cache-control': 'private, max-age=300',
      'x-content-type-options': 'nosniff',
      'cross-origin-resource-policy': 'same-site',
      'referrer-policy': 'no-referrer',
    },
  })
}
