import {
  StorageError,
  eachLimited,
  sizedBody,
  type ByteRange,
  type ObjectInfo,
  type PutOptions,
  type StorageDriver,
} from './driver'
import { encodeKey } from './s3'

/** An Azure Blob Storage container (block blobs), signed with Shared Key or a SAS. */
export interface AzureLocation {
  account: string
  container: string
  prefix: string
  /** `https://<account>.blob.core.windows.net` when absent (Azurite, sovereign clouds). */
  endpoint?: string | undefined
}

export type AzureCredentials =
  | { accountKey: string; sasToken?: undefined }
  | { sasToken: string; accountKey?: undefined }

const VERSION = '2021-08-06'

const encoder = new TextEncoder()

function base64(bytes: ArrayBuffer | Uint8Array): string {
  let binary = ''
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index)
  return bytes
}

/**
 * The Shared Key signature (learn.microsoft.com/rest/api/storageservices/
 * authorize-with-shared-key): standard headers in a fixed order, then the
 * x-ms- headers and the resource with its query.
 */
export async function sharedKeySignature(
  accountKey: string,
  account: string,
  method: string,
  url: URL,
  headers: Headers,
): Promise<string> {
  const header = (name: string) => headers.get(name) ?? ''
  const length = header('content-length')
  const canonicalHeaders = [...headers.keys()]
    .filter((name) => name.startsWith('x-ms-'))
    .sort()
    .map((name) => `${name}:${header(name).replace(/\s+/g, ' ').trim()}\n`)
    .join('')
  const params = new Map<string, string[]>()
  for (const [name, value] of url.searchParams) {
    const key = name.toLowerCase()
    params.set(key, [...(params.get(key) ?? []), value])
  }
  const canonicalResource =
    `/${account}${url.pathname}` +
    [...params.keys()]
      .sort()
      .map((name) => `\n${name}:${params.get(name)!.sort().join(',')}`)
      .join('')
  const stringToSign = [
    method,
    header('content-encoding'),
    header('content-language'),
    length === '0' ? '' : length,
    header('content-md5'),
    header('content-type'),
    '', // Date: x-ms-date is used instead.
    header('if-modified-since'),
    header('if-match'),
    header('if-none-match'),
    header('if-unmodified-since'),
    header('range'),
    canonicalHeaders + canonicalResource,
  ].join('\n')
  const key = await crypto.subtle.importKey(
    'raw',
    fromBase64(accountKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return base64(
    await crypto.subtle.sign('HMAC', key, encoder.encode(stringToSign)),
  )
}

function xmlValue(xml: string, tag: string): string | null {
  return xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1] ?? null
}

async function failure(response: Response, action: string): Promise<never> {
  const text = await response.text().catch(() => '')
  const code =
    response.headers.get('x-ms-error-code') ??
    xmlValue(text, 'Code') ??
    `http_${response.status}`
  const message = xmlValue(text, 'Message')?.split('\n')[0]
  throw new StorageError(
    `The container refused to ${action}: ${code}${message ? ` (${message})` : ''}`,
    response.status,
    code,
  )
}

/** Block ids must all be the same length within a blob. */
function blockId(uploadId: string, partNumber: number): string {
  return btoa(`${uploadId}-${String(partNumber).padStart(6, '0')}`)
}

export function azureDriver(
  location: AzureLocation,
  credentials: AzureCredentials,
): StorageDriver {
  const endpoint = (
    location.endpoint ?? `https://${location.account}.blob.core.windows.net`
  ).replace(/\/+$/, '')
  const sas = credentials.sasToken?.replace(/^\?/, '')

  async function send(
    method: string,
    key: string,
    query: Record<string, string>,
    init: { headers?: Record<string, string>; body?: BodyInit | null } = {},
  ): Promise<Response> {
    const url = new URL(
      `${endpoint}/${encodeURIComponent(location.container)}/${encodeKey(location.prefix + key)}`,
    )
    for (const [name, value] of Object.entries(query))
      url.searchParams.set(name, value)
    if (sas)
      for (const [name, value] of new URLSearchParams(sas))
        url.searchParams.set(name, value)
    const headers = new Headers(init.headers)
    headers.set('x-ms-date', new Date().toUTCString())
    headers.set('x-ms-version', VERSION)
    if (credentials.accountKey) {
      const signature = await sharedKeySignature(
        credentials.accountKey,
        location.account,
        method,
        url,
        headers,
      )
      headers.set('authorization', `SharedKey ${location.account}:${signature}`)
    }
    return fetch(url, { method, headers, body: init.body ?? null }).catch(
      (error: unknown) => {
        throw new StorageError(
          `Could not reach the container: ${error instanceof Error ? error.message : String(error)}`,
          502,
          'unreachable',
        )
      },
    )
  }

  const info = (response: Response): ObjectInfo => {
    const range = response.headers.get('content-range')
    const total = range?.split('/')[1]
    return {
      size: Number(
        total && total !== '*' ? total : response.headers.get('content-length'),
      ),
      sha256: response.headers.get('x-ms-meta-sha256'),
      etag: response.headers.get('etag') ?? '',
      contentType: response.headers.get('content-type'),
    }
  }

  const blobHeaders = (
    options: Omit<PutOptions, 'size'>,
    prefix: 'content' | 'x-ms-blob-content',
  ) => {
    const result: Record<string, string> = {
      [`${prefix}-type`]: options.contentType,
    }
    if (options.sha256) result['x-ms-meta-sha256'] = options.sha256
    if (options.cacheControl)
      result['x-ms-blob-cache-control'] = options.cacheControl
    return result
  }

  return {
    async put(key, body, options) {
      const response = await send(
        'PUT',
        key,
        {},
        {
          headers: {
            ...blobHeaders(options, 'content'),
            'x-ms-blob-type': 'BlockBlob',
            'content-length': String(options.size),
          },
          body: sizedBody(body, options.size),
        },
      )
      if (!response.ok) await failure(response, 'store a file')
    },
    async get(key, range?: ByteRange) {
      const response = await send(
        'GET',
        key,
        {},
        {
          headers: range
            ? {
                'x-ms-range': `bytes=${range.offset}-${range.offset + range.length - 1}`,
              }
            : {},
        },
      )
      if (response.status === 404) {
        await response.body?.cancel()
        return null
      }
      if (!response.ok || !response.body)
        return failure(response, 'read a file')
      return { ...info(response), body: response.body }
    },
    async head(key) {
      const response = await send('HEAD', key, {})
      if (response.status === 404) return null
      if (!response.ok) return failure(response, 'describe a file')
      return info(response)
    },
    async delete(keys) {
      await eachLimited([...new Set(keys)], 8, async (key) => {
        const response = await send('DELETE', key, {})
        if (!response.ok && response.status !== 404)
          await failure(response, 'delete a file')
      })
    },
    // Multipart is Put Block, then Put Block List; there's nothing to start,
    // and uncommitted blocks expire on their own.
    async createMultipart() {
      return crypto.randomUUID().replace(/-/g, '')
    },
    async uploadPart(key, uploadId, partNumber, body, size) {
      const id = blockId(uploadId, partNumber)
      const response = await send(
        'PUT',
        key,
        { comp: 'block', blockid: id },
        {
          headers: { 'content-length': String(size) },
          body: sizedBody(body, size),
        },
      )
      if (!response.ok) await failure(response, 'store a part')
      return { partNumber, etag: id }
    },
    async completeMultipart(key, uploadId, parts, options) {
      const xml = `<?xml version="1.0" encoding="utf-8"?><BlockList>${parts
        .map((part) => `<Latest>${blockId(uploadId, part.partNumber)}</Latest>`)
        .join('')}</BlockList>`
      const response = await send(
        'PUT',
        key,
        { comp: 'blocklist' },
        {
          headers: {
            ...blobHeaders(options, 'x-ms-blob-content'),
            'content-type': 'application/xml',
            'content-length': String(encoder.encode(xml).length),
          },
          body: xml,
        },
      )
      if (!response.ok) await failure(response, 'finish a multipart upload')
    },
    async abortMultipart() {},
  }
}
