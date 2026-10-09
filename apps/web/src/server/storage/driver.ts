/**
 * Where document bytes live. Every file row names its storage (null is
 * Otterware's own R2 bucket), and everything that reads or writes bytes goes
 * through a driver: R2 by binding, any S3-compatible bucket (AWS, GCS
 * through its XML API, a customer's R2, MinIO…), or Azure Blob Storage.
 *
 * Keys are the logical ones stored in the database (`versions/…`,
 * `previews/…`); a driver adds its bucket's prefix. Objects are written once:
 * versions are immutable, so drivers never update in place.
 */

export interface ObjectInfo {
  size: number
  /** The SHA-256 written with the object, as hex. */
  sha256: string | null
  etag: string
  contentType: string | null
}

export interface ObjectBody extends ObjectInfo {
  body: ReadableStream<Uint8Array>
}

export interface PutOptions {
  contentType: string
  /** Byte length of the body; providers need it for streamed bodies. */
  size: number
  sha256?: string | undefined
  cacheControl?: string | undefined
}

export interface ByteRange {
  offset: number
  length: number
}

export interface UploadedPart {
  partNumber: number
  etag: string
}

export type PutBody =
  ReadableStream<Uint8Array> | ArrayBuffer | Uint8Array<ArrayBuffer>

export interface StorageDriver {
  put(key: string, body: PutBody, options: PutOptions): Promise<void>
  get(key: string, range?: ByteRange): Promise<ObjectBody | null>
  head(key: string): Promise<ObjectInfo | null>
  /** Missing keys are not an error. */
  delete(keys: string[]): Promise<void>
  /** Starts a multipart upload; returns its id. */
  createMultipart(
    key: string,
    options: Omit<PutOptions, 'size'>,
  ): Promise<string>
  uploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    body: ReadableStream<Uint8Array>,
    size: number,
  ): Promise<UploadedPart>
  completeMultipart(
    key: string,
    uploadId: string,
    parts: UploadedPart[],
    options: Omit<PutOptions, 'size'>,
  ): Promise<void>
  abortMultipart(key: string, uploadId: string): Promise<void>
}

/** A provider refused or failed a request; the message is safe to show. */
export class StorageError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message)
    this.name = 'StorageError'
  }
}

/**
 * A body with a known length, as providers require: Workers send a stream
 * through a FixedLengthStream with a Content-Length instead of chunked.
 */
export function sizedBody(body: PutBody, size: number): BodyInit {
  if (!(body instanceof ReadableStream)) return body
  if (typeof FixedLengthStream === 'undefined') return body
  const fixed = new FixedLengthStream(size)
  void body.pipeTo(fixed.writable).catch(() => {})
  return fixed.readable
}

/** Runs `task` over `items`, `limit` at a time. */
export async function eachLimited<T>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await task(items[next++]!)
    }),
  )
}
