import type { StorageLocation } from '@otterware/contracts'
import { HttpError } from '../http'
import type { Env } from '../types'
import { azureDriver } from './azure'
import { openCredentials } from './credentials'
import { StorageError, type StorageDriver } from './driver'
import { r2Driver } from './r2'
import { s3Driver } from './s3'

export { StorageError, type StorageDriver } from './driver'

/** A connected bucket, as stored. */
export interface StorageBackendRow {
  id: string
  drive_id: string
  name: string
  provider: StorageLocation['provider']
  location_json: string
  credentials_ciphertext: string
  created_by_user_id: string
  created_at: string
  verified_at: string | null
}

/** Otterware's own R2 bucket, through the binding. */
export function otterwareStorage(env: Env): StorageDriver {
  return r2Driver(env.ARTIFACTS)
}

/** The driver for a connected bucket, from its location and credentials. */
export function driverFor(
  location: StorageLocation,
  credentials: Record<string, string>,
): StorageDriver {
  switch (location.provider) {
    case 's3':
      return s3Driver(
        {
          endpoint: location.endpoint ?? undefined,
          region: location.region,
          bucket: location.bucket,
          prefix: location.prefix,
          pathStyle: location.pathStyle,
        },
        {
          accessKeyId: credentials.accessKeyId!,
          secretAccessKey: credentials.secretAccessKey!,
        },
      )
    case 'gcs':
      // Cloud Storage's XML API speaks S3 with HMAC keys.
      return s3Driver(
        {
          endpoint: 'https://storage.googleapis.com',
          region: 'auto',
          bucket: location.bucket,
          prefix: location.prefix,
          pathStyle: true,
          metaPrefix: 'x-goog-meta-',
        },
        {
          accessKeyId: credentials.accessKeyId!,
          secretAccessKey: credentials.secretAccessKey!,
        },
      )
    case 'azure':
      return azureDriver(
        {
          account: location.account,
          container: location.container,
          prefix: location.prefix,
          endpoint: location.endpoint ?? undefined,
        },
        credentials.accountKey
          ? { accountKey: credentials.accountKey }
          : { sasToken: credentials.sasToken! },
      )
  }
}

export async function backendDriver(
  env: Env,
  row: StorageBackendRow,
): Promise<StorageDriver> {
  return driverFor(
    JSON.parse(row.location_json) as StorageLocation,
    await openCredentials(env, row.id, row.credentials_ciphertext),
  )
}

/**
 * Where a file's bytes are: Otterware's bucket for null, else the connected
 * bucket. Errors from a customer's bucket reach the client as 502s with the
 * provider's reason.
 */
export async function storageFor(
  env: Env,
  backendId: string | null | undefined,
): Promise<StorageDriver> {
  if (!backendId) return otterwareStorage(env)
  const row = await env.DB.prepare('SELECT * FROM storage_backend WHERE id = ?')
    .bind(backendId)
    .first<StorageBackendRow>()
  if (!row)
    throw new HttpError(
      500,
      'storage_missing',
      'The storage holding this file is no longer connected.',
    )
  return backendDriver(env, row)
}

/** `storageFor`, remembered per backend: for work spanning many files. */
export function storageResolver(env: Env) {
  const drivers = new Map<string, Promise<StorageDriver>>()
  return (backendId: string | null | undefined) => {
    const key = backendId ?? ''
    let driver = drivers.get(key)
    if (!driver) {
      driver = storageFor(env, backendId)
      drivers.set(key, driver)
    }
    return driver
  }
}

/** The storage new uploads to a folder go to: its drive's choice. */
export async function uploadStorageId(
  env: Env,
  folderId: string,
): Promise<string | null> {
  const row = await env.DB.prepare(
    `WITH RECURSIVE ancestors AS (
       SELECT id, parent_id, storage_backend_id FROM folder WHERE id = ?
       UNION ALL SELECT f.id, f.parent_id, f.storage_backend_id
         FROM folder f JOIN ancestors a ON f.id = a.parent_id
     ) SELECT storage_backend_id FROM ancestors WHERE parent_id IS NULL`,
  )
    .bind(folderId)
    .first<{ storage_backend_id: string | null }>()
  return row?.storage_backend_id ?? null
}

/**
 * Proves a bucket works before anything is stored in it: write a small
 * object, describe it, read it back, delete it. The error names the step.
 */
export async function probeStorage(driver: StorageDriver): Promise<void> {
  const key = `.otterdrive/probe-${crypto.randomUUID()}`
  const body = new TextEncoder().encode('otterdrive storage check\n')
  const digest = await crypto.subtle.digest('SHA-256', body)
  const sha256 = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
  const step = async <T>(name: string, run: () => Promise<T>): Promise<T> => {
    try {
      return await run()
    } catch (error) {
      if (error instanceof StorageError)
        throw new HttpError(
          422,
          'storage_check_failed',
          `Couldn’t ${name}. ${error.message}`,
        )
      throw error
    }
  }
  await step('write a test file', () =>
    driver.put(key, body, {
      contentType: 'text/plain',
      size: body.byteLength,
      sha256,
    }),
  )
  try {
    const info = await step('describe the test file', () => driver.head(key))
    if (!info || info.size !== body.byteLength)
      throw new HttpError(
        422,
        'storage_check_failed',
        'The test file was written, but the bucket reports it missing or a different size.',
      )
    if (info.sha256 !== sha256)
      throw new HttpError(
        422,
        'storage_check_failed',
        'The bucket dropped the file’s metadata (its sha256), which Drive uses to verify uploads.',
      )
    const read = await step('read the test file', () => driver.get(key))
    const text = read ? await new Response(read.body).text() : null
    if (text !== 'otterdrive storage check\n')
      throw new HttpError(
        422,
        'storage_check_failed',
        'The bucket returned different bytes for the test file.',
      )
  } finally {
    await step('delete the test file', () => driver.delete([key]))
  }
}
