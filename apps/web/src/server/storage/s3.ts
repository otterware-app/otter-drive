import { AwsClient } from 'aws4fetch'
import {
  StorageError,
  eachLimited,
  sizedBody,
  type ByteRange,
  type ObjectInfo,
  type PutOptions,
  type StorageDriver,
} from './driver'

/**
 * Any bucket that speaks the S3 API, signed with SigV4: Amazon S3, Google
 * Cloud Storage's XML API (with HMAC keys), Cloudflare R2, Backblaze B2,
 * Wasabi, MinIO…
 */
export interface S3Location {
  /** `https://s3.<region>.amazonaws.com` when absent. */
  endpoint?: string | undefined
  region: string
  bucket: string
  /** Prepended to every key, e.g. `otterdrive/`. */
  prefix: string
  /** Bucket in the path rather than the host name. */
  pathStyle: boolean
}

export interface S3Credentials {
  accessKeyId: string
  secretAccessKey: string
}

/** S3's key encoding: each segment percent-encoded, slashes kept. */
export function encodeKey(key: string): string {
  return key
    .split('/')
    .map((segment) =>
      encodeURIComponent(segment).replace(
        /[!'()*]/g,
        (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
      ),
    )
    .join('/')
}

export function bucketBase(location: S3Location): string {
  const endpoint = new URL(
    location.endpoint ?? `https://s3.${location.region}.amazonaws.com`,
  )
  const path = endpoint.pathname.replace(/\/+$/, '')
  if (location.pathStyle)
    return `${endpoint.origin}${path}/${encodeURIComponent(location.bucket)}/`
  return `${endpoint.protocol}//${location.bucket}.${endpoint.host}${path}/`
}

/** S3 and GCS report errors as `<Error><Code/><Message/></Error>`. */
function xmlValue(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))
  return match
    ? match[1]!
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
    : null
}

async function failure(response: Response, action: string): Promise<never> {
  const text = await response.text().catch(() => '')
  const code = xmlValue(text, 'Code') ?? `http_${response.status}`
  const message = xmlValue(text, 'Message') ?? response.statusText
  throw new StorageError(
    `The bucket refused to ${action}: ${code}${message ? ` (${message})` : ''}`,
    response.status,
    code,
  )
}

export function s3Driver(
  location: S3Location,
  credentials: S3Credentials,
): StorageDriver {
  const client = new AwsClient({
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey,
    service: 's3',
    region: location.region,
    // A streamed body can't be sent twice.
    retries: 0,
  })
  const base = bucketBase(location)
  const url = (key: string, query = '') =>
    `${base}${encodeKey(location.prefix + key)}${query}`
  const send = (target: string, init: RequestInit) =>
    client.fetch(target, init).catch((error: unknown) => {
      throw new StorageError(
        `Could not reach the bucket: ${error instanceof Error ? error.message : String(error)}`,
        502,
        'unreachable',
      )
    })
  const headers = (options: Omit<PutOptions, 'size'>) => {
    const result: Record<string, string> = {
      'content-type': options.contentType,
    }
    // GCS takes x-amz-meta- too, and refuses x-goog- headers beside SigV4's
    // x-amz- ones.
    if (options.sha256) result['x-amz-meta-sha256'] = options.sha256
    if (options.cacheControl) result['cache-control'] = options.cacheControl
    return result
  }
  const info = (response: Response): ObjectInfo => {
    const range = response.headers.get('content-range')
    const total = range?.split('/')[1]
    return {
      size: Number(
        total && total !== '*' ? total : response.headers.get('content-length'),
      ),
      sha256:
        response.headers.get('x-amz-meta-sha256') ??
        response.headers.get('x-goog-meta-sha256'),
      etag: response.headers.get('etag') ?? '',
      contentType: response.headers.get('content-type'),
    }
  }

  return {
    async put(key, body, options) {
      const response = await send(url(key), {
        method: 'PUT',
        headers: {
          ...headers(options),
          'content-length': String(options.size),
        },
        body: sizedBody(body, options.size),
      })
      if (!response.ok) await failure(response, 'store a file')
    },
    async get(key, range?: ByteRange) {
      const response = await send(url(key), {
        method: 'GET',
        headers: range
          ? {
              range: `bytes=${range.offset}-${range.offset + range.length - 1}`,
            }
          : {},
      })
      if (response.status === 404) {
        await response.body?.cancel()
        return null
      }
      if (!response.ok || !response.body)
        return failure(response, 'read a file')
      return { ...info(response), body: response.body }
    },
    async head(key) {
      const response = await send(url(key), { method: 'HEAD' })
      if (response.status === 404) return null
      if (!response.ok) return failure(response, 'describe a file')
      return info(response)
    },
    async delete(keys) {
      // One DELETE per key: DeleteObjects needs Content-MD5, and GCS's XML
      // API doesn't offer it.
      await eachLimited([...new Set(keys)], 8, async (key) => {
        const response = await send(url(key), { method: 'DELETE' })
        if (!response.ok && response.status !== 404)
          await failure(response, 'delete a file')
      })
    },
    async createMultipart(key, options) {
      const response = await send(url(key, '?uploads'), {
        method: 'POST',
        headers: headers(options),
      })
      if (!response.ok) await failure(response, 'start a multipart upload')
      const uploadId = xmlValue(await response.text(), 'UploadId')
      if (!uploadId)
        throw new StorageError(
          'The bucket did not return a multipart upload id.',
          502,
          'invalid_response',
        )
      return uploadId
    },
    async uploadPart(key, uploadId, partNumber, body, size) {
      const response = await send(
        url(
          key,
          `?partNumber=${partNumber}&uploadId=${encodeURIComponent(uploadId)}`,
        ),
        {
          method: 'PUT',
          headers: { 'content-length': String(size) },
          body: sizedBody(body, size),
        },
      )
      if (!response.ok) await failure(response, 'store a part')
      const etag = response.headers.get('etag')
      if (!etag)
        throw new StorageError(
          'The bucket did not return a part ETag.',
          502,
          'invalid_response',
        )
      return { partNumber, etag }
    },
    async completeMultipart(key, uploadId, parts) {
      const xml = `<CompleteMultipartUpload>${parts
        .map(
          (part) =>
            `<Part><PartNumber>${part.partNumber}</PartNumber><ETag>${part.etag
              .replace(/&/g, '&amp;')
              .replace(/"/g, '&quot;')}</ETag></Part>`,
        )
        .join('')}</CompleteMultipartUpload>`
      const response = await send(
        url(key, `?uploadId=${encodeURIComponent(uploadId)}`),
        {
          method: 'POST',
          headers: { 'content-type': 'application/xml' },
          body: xml,
        },
      )
      // S3 can answer 200 and still fail, with the error in the body.
      const text = response.ok ? await response.text() : ''
      if (!response.ok || text.includes('<Error>'))
        await failure(
          response.ok ? new Response(text, { status: 502 }) : response,
          'finish a multipart upload',
        )
    },
    async abortMultipart(key, uploadId) {
      const response = await send(
        url(key, `?uploadId=${encodeURIComponent(uploadId)}`),
        { method: 'DELETE' },
      )
      if (!response.ok && response.status !== 404)
        await failure(response, 'cancel a multipart upload')
    },
  }
}
