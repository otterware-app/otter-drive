import {
  completeUploadResponseSchema,
  uploadSessionResponseSchema,
  multipartUploadPartResponseSchema,
  type CreateUploadInput,
} from '@otterware/contracts'
import { api } from './api'

/** Publish an edited entry with all unchanged files from its source version. */
export async function publishDocumentVersion(input: {
  blob: Blob
  entryPath: string
  baseVersion: number
  expectedCurrentVersion: number
  /** The folder you reach the document through; undefined when by id. */
  folderId: string | undefined
  /** Its slug in that folder, or its id. */
  slug: string
}): Promise<number> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    await input.blob.arrayBuffer(),
  )
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
  const contentType = input.blob.type || 'application/octet-stream'
  const manifest: CreateUploadInput = {
    label: 'Edited in Otter Drive',
    entryPath: input.entryPath,
    baseVersion: input.baseVersion,
    expectedCurrentVersion: input.expectedCurrentVersion,
    files: [
      {
        path: input.entryPath,
        contentType,
        size: input.blob.size,
        sha256: hash,
      },
    ],
  }
  const session = uploadSessionResponseSchema.parse(
    await api<unknown>(
      `/api/v1/artifacts/${encodeURIComponent(input.slug)}/uploads`,
      {
        method: 'POST',
        folderId: input.folderId,
        body: JSON.stringify(manifest),
      },
    ),
  ).data
  const remote = session.files.find((file) => file.path === input.entryPath)
  if (!remote || session.files.length !== 1)
    throw new Error('The upload session did not include the edited file.')
  const headers = { 'content-type': contentType, 'x-content-sha256': hash }
  if (remote.multipart) {
    if (!remote.partSize)
      throw new Error('The upload session omitted its part size.')
    const parts: Array<{ partNumber: number; etag: string }> = []
    const count = Math.ceil(input.blob.size / remote.partSize)
    for (let partNumber = 1; partNumber <= count; partNumber += 1) {
      const start = (partNumber - 1) * remote.partSize
      const url = new URL(remote.uploadUrl)
      url.searchParams.set('part', String(partNumber))
      parts.push(
        multipartUploadPartResponseSchema.parse(
          await api<unknown>(url.toString(), {
            method: 'PUT',
            folderId: input.folderId,
            headers,
            body: input.blob.slice(start, start + remote.partSize),
          }),
        ).data,
      )
    }
    await api<void>(`${remote.uploadUrl}/complete`, {
      method: 'POST',
      folderId: input.folderId,
      body: JSON.stringify({ parts }),
    })
  } else {
    await api<void>(remote.uploadUrl, {
      method: 'PUT',
      folderId: input.folderId,
      headers,
      body: input.blob,
    })
  }
  return completeUploadResponseSchema.parse(
    await api<unknown>(
      `/api/v1/uploads/${encodeURIComponent(session.id)}/complete`,
      { method: 'POST', folderId: input.folderId },
    ),
  ).data.version.number
}
