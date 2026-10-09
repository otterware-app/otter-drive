import type {
  ByteRange,
  ObjectBody,
  ObjectInfo,
  PutBody,
  PutOptions,
  StorageDriver,
  UploadedPart,
} from './driver'

function info(object: R2Object): ObjectInfo {
  return {
    size: object.size,
    sha256: object.customMetadata?.sha256 ?? null,
    etag: object.httpEtag,
    contentType: object.httpMetadata?.contentType ?? null,
  }
}

function metadata(options: Omit<PutOptions, 'size'>) {
  return {
    httpMetadata: {
      contentType: options.contentType,
      ...(options.cacheControl ? { cacheControl: options.cacheControl } : {}),
    },
    ...(options.sha256 ? { customMetadata: { sha256: options.sha256 } } : {}),
  }
}

/** Otterware's own bucket, through the Worker's R2 binding. */
export function r2Driver(bucket: R2Bucket): StorageDriver {
  return {
    async put(key: string, body: PutBody, options: PutOptions) {
      await bucket.put(key, body, metadata(options))
    },
    async get(key: string, range?: ByteRange): Promise<ObjectBody | null> {
      const object = await bucket.get(key, range ? { range } : undefined)
      return object ? { ...info(object), body: object.body } : null
    },
    async head(key: string) {
      const object = await bucket.head(key)
      return object ? info(object) : null
    },
    async delete(keys: string[]) {
      const unique = [...new Set(keys)]
      for (let index = 0; index < unique.length; index += 1000)
        await bucket.delete(unique.slice(index, index + 1000))
    },
    async createMultipart(key, options) {
      return (await bucket.createMultipartUpload(key, metadata(options)))
        .uploadId
    },
    async uploadPart(key, uploadId, partNumber, body) {
      const part = await bucket
        .resumeMultipartUpload(key, uploadId)
        .uploadPart(partNumber, body)
      return { partNumber: part.partNumber, etag: part.etag }
    },
    async completeMultipart(key, uploadId, parts: UploadedPart[]) {
      await bucket.resumeMultipartUpload(key, uploadId).complete(parts)
    },
    async abortMultipart(key, uploadId) {
      await bucket.resumeMultipartUpload(key, uploadId).abort()
    },
  }
}
