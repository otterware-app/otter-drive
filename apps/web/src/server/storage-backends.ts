import {
  createStorageBackendInputSchema,
  driveStorageResponseSchema,
  storageBackendResponseSchema,
  updateDriveStorageInputSchema,
  type StorageBackend,
  type StorageLocation,
} from '@otterware/contracts'
import { z } from 'zod'
import { folderAccess } from './folders'
import { HttpError, json, parseJson } from './http'
import {
  driverFor,
  probeStorage,
  storageFor,
  type StorageBackendRow,
} from './storage'
import { openCredentials, sealCredentials } from './storage/credentials'
import type { AuthenticatedActor, Env } from './types'

/**
 * A drive's storage (`/api/v1/folders/<drive>/storage`): the buckets it's
 * connected to, and which one new uploads go to. Only the drive's owner, as
 * a person (never an API key), sees or changes it. A bucket is checked with
 * a write, read and delete before it's saved; its credentials are sealed and
 * never returned.
 *
 * Files stay where they were written: switching the default only moves new
 * uploads, and a bucket can't be removed while any file is stored in it.
 */

const rotateCredentialsSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  accessKeyId: z.string().trim().min(1).max(4096).optional(),
  secretAccessKey: z.string().trim().min(1).max(4096).optional(),
  accountKey: z.string().trim().min(1).max(4096).optional(),
  sasToken: z.string().trim().min(1).max(4096).optional(),
})

async function assertDriveOwner(
  env: Env,
  actor: AuthenticatedActor,
  driveId: string,
) {
  if (actor.type !== 'user' || !actor.userId)
    throw new HttpError(
      403,
      'forbidden',
      'Sign in as the drive’s owner to manage its storage.',
    )
  const access = await folderAccess(env, actor.userId, driveId)
  if (access.driveId !== driveId)
    throw new HttpError(
      400,
      'not_a_drive',
      'Storage belongs to a drive, not to a folder inside one.',
    )
  if (access.role !== 'owner')
    throw new HttpError(
      403,
      'forbidden',
      'Only the drive’s owner can manage its storage.',
    )
}

/** Custom endpoints must be HTTPS, except against a local dev server. */
function assertEndpoint(env: Env, endpoint: string | undefined) {
  if (!endpoint) return
  const url = new URL(endpoint)
  const local = new URL(env.APP_URL).hostname === 'localhost'
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))
    throw new HttpError(
      400,
      'insecure_endpoint',
      'The storage endpoint must use HTTPS.',
    )
  if (url.username || url.password || url.search || url.hash)
    throw new HttpError(
      400,
      'invalid_endpoint',
      'Give the endpoint without credentials, query or fragment.',
    )
}

function locationAndCredentials(
  input: z.output<typeof createStorageBackendInputSchema>,
): { location: StorageLocation; credentials: Record<string, string> } {
  switch (input.provider) {
    case 's3':
      return {
        location: {
          provider: 's3',
          bucket: input.bucket,
          region: input.region,
          endpoint: input.endpoint ?? null,
          pathStyle: input.pathStyle ?? Boolean(input.endpoint),
          prefix: input.prefix ?? '',
        },
        credentials: {
          accessKeyId: input.accessKeyId,
          secretAccessKey: input.secretAccessKey,
        },
      }
    case 'gcs':
      return {
        location: {
          provider: 'gcs',
          bucket: input.bucket,
          prefix: input.prefix ?? '',
        },
        credentials: {
          accessKeyId: input.accessKeyId,
          secretAccessKey: input.secretAccessKey,
        },
      }
    case 'azure':
      return {
        location: {
          provider: 'azure',
          account: input.account,
          container: input.container,
          endpoint: input.endpoint ?? null,
          prefix: input.prefix ?? '',
        },
        credentials: input.accountKey
          ? { accountKey: input.accountKey }
          : { sasToken: input.sasToken! },
      }
  }
}

interface BackendListRow extends StorageBackendRow {
  file_count: number
  byte_size: number
  is_default: number
}

function mapBackend(row: BackendListRow): StorageBackend {
  return {
    id: row.id,
    name: row.name,
    location: JSON.parse(row.location_json) as StorageLocation,
    isDefault: Boolean(row.is_default),
    fileCount: row.file_count,
    byteSize: row.byte_size,
    createdAt: row.created_at,
    verifiedAt: row.verified_at,
  }
}

const BACKEND_COLUMNS = `b.*,
  (SELECT count(*) FROM artifact_file f WHERE f.storage_backend_id = b.id) AS file_count,
  (SELECT coalesce(sum(f.size), 0) FROM artifact_file f WHERE f.storage_backend_id = b.id) AS byte_size,
  (SELECT count(*) FROM folder d WHERE d.id = b.drive_id AND d.storage_backend_id = b.id) AS is_default`

async function backendRow(
  env: Env,
  driveId: string,
  backendId: string,
): Promise<BackendListRow> {
  const row = await env.DB.prepare(
    `SELECT ${BACKEND_COLUMNS} FROM storage_backend b WHERE b.id = ? AND b.drive_id = ?`,
  )
    .bind(backendId, driveId)
    .first<BackendListRow>()
  if (!row) throw new HttpError(404, 'storage_not_found', 'Storage not found.')
  return row
}

async function audit(
  env: Env,
  actor: AuthenticatedActor,
  driveId: string,
  action: string,
  backendId: string,
  metadata: Record<string, unknown>,
) {
  await env.DB.prepare(
    `INSERT INTO audit_event
      (id, folder_id, actor_type, actor_id, actor_name, action, resource_type, resource_id, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'storage_backend', ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      driveId,
      actor.type,
      actor.id,
      actor.name,
      action,
      backendId,
      JSON.stringify(metadata),
      new Date().toISOString(),
    )
    .run()
}

async function listStorage(env: Env, driveId: string): Promise<Response> {
  const [backends, otterware, drive] = await Promise.all([
    env.DB.prepare(
      `SELECT ${BACKEND_COLUMNS} FROM storage_backend b WHERE b.drive_id = ? ORDER BY b.created_at`,
    )
      .bind(driveId)
      .all<BackendListRow>(),
    env.DB.prepare(
      `WITH RECURSIVE tree(id) AS (
         SELECT id FROM folder WHERE id = ?
         UNION ALL SELECT f.id FROM folder f JOIN tree t ON f.parent_id = t.id
       ) SELECT count(*) AS file_count, coalesce(sum(af.size), 0) AS byte_size
         FROM artifact_file af
         JOIN artifact_version av ON av.id = af.version_id
         JOIN artifact a ON a.id = av.artifact_id
        WHERE a.folder_id IN (SELECT id FROM tree) AND af.storage_backend_id IS NULL`,
    )
      .bind(driveId)
      .first<{ file_count: number; byte_size: number }>(),
    env.DB.prepare('SELECT storage_backend_id FROM folder WHERE id = ?')
      .bind(driveId)
      .first<{ storage_backend_id: string | null }>(),
  ])
  return json(
    driveStorageResponseSchema.parse({
      data: {
        defaultBackendId: drive?.storage_backend_id ?? null,
        otterware: {
          fileCount: otterware?.file_count ?? 0,
          byteSize: otterware?.byte_size ?? 0,
        },
        backends: backends.results.map(mapBackend),
      },
    }),
  )
}

async function connectStorage(
  request: Request,
  env: Env,
  actor: AuthenticatedActor,
  driveId: string,
): Promise<Response> {
  const input = createStorageBackendInputSchema.parse(await parseJson(request))
  assertEndpoint(env, 'endpoint' in input ? input.endpoint : undefined)
  const { location, credentials } = locationAndCredentials(input)
  await probeStorage(driverFor(location, credentials))
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const statements = [
    env.DB.prepare(
      `INSERT INTO storage_backend
        (id, drive_id, name, provider, location_json, credentials_ciphertext, created_by_user_id, created_at, verified_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      driveId,
      input.name,
      location.provider,
      JSON.stringify(location),
      await sealCredentials(env, id, credentials),
      actor.userId,
      now,
      now,
    ),
  ]
  if (input.makeDefault)
    statements.push(
      env.DB.prepare(
        'UPDATE folder SET storage_backend_id = ? WHERE id = ?',
      ).bind(id, driveId),
    )
  await env.DB.batch(statements)
  await audit(env, actor, driveId, 'storage.connected', id, {
    name: input.name,
    provider: location.provider,
    default: Boolean(input.makeDefault),
  })
  return json(
    storageBackendResponseSchema.parse({
      data: mapBackend(await backendRow(env, driveId, id)),
    }),
    { status: 201 },
  )
}

async function setDefaultStorage(
  request: Request,
  env: Env,
  actor: AuthenticatedActor,
  driveId: string,
): Promise<Response> {
  const input = updateDriveStorageInputSchema.parse(await parseJson(request))
  if (input.defaultBackendId)
    await backendRow(env, driveId, input.defaultBackendId)
  await env.DB.prepare('UPDATE folder SET storage_backend_id = ? WHERE id = ?')
    .bind(input.defaultBackendId, driveId)
    .run()
  await audit(
    env,
    actor,
    driveId,
    'storage.default_changed',
    input.defaultBackendId ?? 'otterware',
    {},
  )
  return listStorage(env, driveId)
}

async function verifyStorage(
  env: Env,
  driveId: string,
  backendId: string,
): Promise<Response> {
  await backendRow(env, driveId, backendId)
  await probeStorage(await storageFor(env, backendId))
  await env.DB.prepare(
    'UPDATE storage_backend SET verified_at = ? WHERE id = ?',
  )
    .bind(new Date().toISOString(), backendId)
    .run()
  return json(
    storageBackendResponseSchema.parse({
      data: mapBackend(await backendRow(env, driveId, backendId)),
    }),
  )
}

/** Renames a bucket, or replaces its credentials (checked before they're kept). */
async function updateStorage(
  request: Request,
  env: Env,
  actor: AuthenticatedActor,
  driveId: string,
  backendId: string,
): Promise<Response> {
  const row = await backendRow(env, driveId, backendId)
  const input = rotateCredentialsSchema.parse(await parseJson(request))
  const location = JSON.parse(row.location_json) as StorageLocation
  const current = await openCredentials(env, row.id, row.credentials_ciphertext)
  let next: Record<string, string> | null = null
  if (location.provider === 'azure') {
    if (input.accountKey && input.sasToken)
      throw new HttpError(
        400,
        'invalid_credentials',
        'Give either an account key or a SAS token.',
      )
    if (input.accountKey) next = { accountKey: input.accountKey }
    else if (input.sasToken) next = { sasToken: input.sasToken }
  } else if (input.accessKeyId || input.secretAccessKey) {
    next = {
      accessKeyId: input.accessKeyId ?? current.accessKeyId!,
      secretAccessKey: input.secretAccessKey ?? current.secretAccessKey!,
    }
  }
  const now = new Date().toISOString()
  if (next) {
    await probeStorage(driverFor(location, next))
    await env.DB.prepare(
      'UPDATE storage_backend SET credentials_ciphertext = ?, verified_at = ? WHERE id = ?',
    )
      .bind(await sealCredentials(env, row.id, next), now, row.id)
      .run()
    await audit(env, actor, driveId, 'storage.credentials_rotated', row.id, {})
  }
  if (input.name)
    await env.DB.prepare('UPDATE storage_backend SET name = ? WHERE id = ?')
      .bind(input.name, row.id)
      .run()
  return json(
    storageBackendResponseSchema.parse({
      data: mapBackend(await backendRow(env, driveId, backendId)),
    }),
  )
}

/** Disconnects a bucket that holds nothing (Drive never deletes its contents). */
async function disconnectStorage(
  env: Env,
  actor: AuthenticatedActor,
  driveId: string,
  backendId: string,
): Promise<Response> {
  const row = await backendRow(env, driveId, backendId)
  if (row.is_default)
    throw new HttpError(
      409,
      'storage_is_default',
      'New uploads go to this storage. Choose another for new uploads first.',
    )
  const held = await env.DB.prepare(
    `SELECT
       (SELECT count(*) FROM artifact_file WHERE storage_backend_id = ?) +
       (SELECT count(*) FROM artifact_version WHERE preview_storage_backend_id = ?) +
       (SELECT count(*) FROM artifact_upload WHERE state = 'pending'
          AND instr(manifest_json, ?) > 0) AS total`,
  )
    .bind(backendId, backendId, `"storageBackendId":"${backendId}"`)
    .first<{ total: number }>()
  if (held?.total)
    throw new HttpError(
      409,
      'storage_in_use',
      'Documents are still stored here, including old versions and documents moved to other drives. Delete them before disconnecting it.',
    )
  await env.DB.prepare('DELETE FROM storage_backend WHERE id = ?')
    .bind(backendId)
    .run()
  await audit(env, actor, driveId, 'storage.disconnected', backendId, {
    name: row.name,
  })
  return new Response(null, { status: 204 })
}

export async function driveStorage(
  request: Request,
  env: Env,
  actor: AuthenticatedActor,
  driveId: string,
  rest: string[],
): Promise<Response> {
  await assertDriveOwner(env, actor, driveId)
  const [backendId, action] = rest
  if (!backendId) {
    if (request.method === 'GET') return listStorage(env, driveId)
    if (request.method === 'POST')
      return connectStorage(request, env, actor, driveId)
    if (request.method === 'PATCH')
      return setDefaultStorage(request, env, actor, driveId)
  } else if (!action) {
    if (request.method === 'PATCH')
      return updateStorage(request, env, actor, driveId, backendId)
    if (request.method === 'DELETE')
      return disconnectStorage(env, actor, driveId, backendId)
  } else if (action === 'verify' && request.method === 'POST') {
    return verifyStorage(env, driveId, backendId)
  }
  throw new HttpError(404, 'not_found', 'API endpoint not found.')
}
