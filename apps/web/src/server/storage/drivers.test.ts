import { AwsClient } from 'aws4fetch'
import { beforeAll, describe, expect, it } from 'vitest'
import { azureDriver, sharedKeySignature } from './azure'
import { openCredentials, sealCredentials } from './credentials'
import type { StorageDriver } from './driver'
import { driverFor, probeStorage } from './index'
import { bucketBase, encodeKey, s3Driver } from './s3'

/**
 * The drivers against real servers, when they're running:
 *   STORAGE_TEST_S3=http://localhost:8333   (SeaweedFS, MinIO… with
 *     STORAGE_TEST_S3_KEY / STORAGE_TEST_S3_SECRET)
 *   STORAGE_TEST_AZURE=http://127.0.0.1:10000/devstoreaccount1   (Azurite)
 */

const S3 = process.env.STORAGE_TEST_S3
const AZURE = process.env.STORAGE_TEST_AZURE
// Azurite's published development account.
const AZURITE_KEY =
  'Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw=='

// Node needs `duplex` to send a stream; Workers don't.
const nodeFetch = globalThis.fetch
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
  nodeFetch(
    input,
    init?.body instanceof ReadableStream
      ? ({ ...init, duplex: 'half' } as RequestInit)
      : init,
  )) as typeof fetch

const encoder = new TextEncoder()
const sha256 = async (bytes: Uint8Array<ArrayBuffer>) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
const stream = (bytes: Uint8Array<ArrayBuffer>) => new Response(bytes).body!

/** Every operation Drive relies on, in the order uploads use them. */
function exercise(name: string, driver: () => StorageDriver) {
  it(`${name}: stores, describes, reads ranges and deletes`, async () => {
    const storage = driver()
    const key = `versions/test/${crypto.randomUUID()}/a file (1)+ü.html`
    const body = encoder.encode('<h1>Hello from Otter Drive</h1>')
    const hash = await sha256(body)
    await storage.put(key, stream(body), {
      contentType: 'text/html',
      size: body.byteLength,
      sha256: hash,
    })
    const info = await storage.head(key)
    expect(info).toMatchObject({ size: body.byteLength, sha256: hash })
    expect(info?.contentType).toContain('text/html')

    const whole = await storage.get(key)
    expect(await new Response(whole!.body).text()).toBe(
      '<h1>Hello from Otter Drive</h1>',
    )
    const part = await storage.get(key, { offset: 4, length: 5 })
    expect(await new Response(part!.body).text()).toBe('Hello')
    expect(part!.size).toBe(body.byteLength)

    await storage.delete([key])
    expect(await storage.head(key)).toBeNull()
    expect(await storage.get(key)).toBeNull()
    // Deleting what's gone is fine.
    await storage.delete([key])
  })

  it(`${name}: assembles a multipart upload`, async () => {
    const storage = driver()
    const key = `versions/test/${crypto.randomUUID()}/video.webm`
    // S3 needs parts of at least 5 MiB, except the last.
    const first = new Uint8Array(5 * 1024 * 1024).fill(7)
    const second = encoder.encode('the end')
    const whole = new Uint8Array(first.length + second.length)
    whole.set(first)
    whole.set(second, first.length)
    const hash = await sha256(whole)
    const uploadId = await storage.createMultipart(key, {
      contentType: 'video/webm',
      sha256: hash,
    })
    const parts = [
      await storage.uploadPart(key, uploadId, 1, stream(first), first.length),
      await storage.uploadPart(key, uploadId, 2, stream(second), second.length),
    ]
    await storage.completeMultipart(key, uploadId, parts, {
      contentType: 'video/webm',
      sha256: hash,
    })
    expect(await storage.head(key)).toMatchObject({
      size: whole.length,
      sha256: hash,
    })
    const tail = await storage.get(key, {
      offset: first.length,
      length: second.length,
    })
    expect(await new Response(tail!.body).text()).toBe('the end')
    await storage.delete([key])
  })

  it(`${name}: abandons a multipart upload`, async () => {
    const storage = driver()
    const key = `versions/test/${crypto.randomUUID()}/big.bin`
    const uploadId = await storage.createMultipart(key, {
      contentType: 'application/octet-stream',
    })
    await storage.abortMultipart(key, uploadId)
    expect(await storage.head(key)).toBeNull()
  })
}

describe('S3-compatible keys and URLs', () => {
  it('encodes each key segment like S3 does', () => {
    expect(encodeKey("versions/a/b c/it's (1)*.html")).toBe(
      'versions/a/b%20c/it%27s%20%281%29%2A.html',
    )
  })
  it('puts the bucket in the host for AWS and in the path for others', () => {
    expect(
      bucketBase({
        region: 'eu-west-3',
        bucket: 'acme',
        prefix: '',
        pathStyle: false,
      }),
    ).toBe('https://acme.s3.eu-west-3.amazonaws.com/')
    expect(
      bucketBase({
        endpoint: 'https://abc.r2.cloudflarestorage.com',
        region: 'auto',
        bucket: 'acme',
        prefix: '',
        pathStyle: true,
      }),
    ).toBe('https://abc.r2.cloudflarestorage.com/acme/')
  })
})

describe('Azure Shared Key', () => {
  it('signs the documented canonical form', async () => {
    const headers = new Headers({
      'x-ms-date': 'Fri, 26 Jun 2015 23:39:12 GMT',
      'x-ms-version': '2015-02-21',
    })
    const signature = await sharedKeySignature(
      AZURITE_KEY,
      'myaccount',
      'GET',
      new URL(
        'https://myaccount.blob.core.windows.net/mycontainer?restype=container&comp=metadata',
      ),
      headers,
    )
    // Recomputed by hand from the string to sign in Microsoft's docs.
    const key = await crypto.subtle.importKey(
      'raw',
      Uint8Array.from(atob(AZURITE_KEY), (char) => char.charCodeAt(0)),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const expected = btoa(
      String.fromCharCode(
        ...new Uint8Array(
          await crypto.subtle.sign(
            'HMAC',
            key,
            encoder.encode(
              'GET\n\n\n\n\n\n\n\n\n\n\n\nx-ms-date:Fri, 26 Jun 2015 23:39:12 GMT\nx-ms-version:2015-02-21\n/myaccount/mycontainer\ncomp:metadata\nrestype:container',
            ),
          ),
        ),
      ),
    )
    expect(signature).toBe(expected)
  })
})

describe('sealed credentials', () => {
  const env = { BETTER_AUTH_SECRET: 'a-long-test-secret' }
  it('round-trips and never stores the secret in the clear', async () => {
    const sealed = await sealCredentials(env, 'backend-1', {
      secretAccessKey: 'super-secret',
    })
    expect(sealed).not.toContain('super-secret')
    expect(await openCredentials(env, 'backend-1', sealed)).toEqual({
      secretAccessKey: 'super-secret',
    })
  })
  it('only opens on the row it was sealed for, under the same key', async () => {
    const sealed = await sealCredentials(env, 'backend-1', { a: 'b' })
    await expect(openCredentials(env, 'backend-2', sealed)).rejects.toThrow()
    await expect(
      openCredentials(
        { ...env, STORAGE_CREDENTIALS_KEY: 'another' },
        'backend-1',
        sealed,
      ),
    ).rejects.toThrow()
  })
})

describe.runIf(S3)('S3 driver against a live server', () => {
  const bucket = `otterdrive-test-${Date.now()}`
  const credentials = {
    accessKeyId: process.env.STORAGE_TEST_S3_KEY ?? 'otteradmin',
    secretAccessKey: process.env.STORAGE_TEST_S3_SECRET ?? 'otteradmin-secret',
  }
  beforeAll(async () => {
    const client = new AwsClient({
      ...credentials,
      service: 's3',
      region: 'us-east-1',
    })
    const response = await client.fetch(`${S3}/${bucket}`, { method: 'PUT' })
    expect(response.ok).toBe(true)
  })
  exercise('s3', () =>
    s3Driver(
      {
        endpoint: S3,
        region: 'us-east-1',
        bucket,
        prefix: 'drive/',
        pathStyle: true,
      },
      credentials,
    ),
  )
  it('s3: reports the provider’s reason for a refusal', async () => {
    const storage = s3Driver(
      {
        endpoint: S3,
        region: 'us-east-1',
        bucket,
        prefix: '',
        pathStyle: true,
      },
      { accessKeyId: credentials.accessKeyId, secretAccessKey: 'wrong' },
    )
    await expect(
      storage.put('x', encoder.encode('x'), {
        contentType: 'text/plain',
        size: 1,
      }),
    ).rejects.toThrow(/refused to store a file: SignatureDoesNotMatch/)
  })
})

describe.runIf(AZURE)('Azure driver against a live server', () => {
  const container = `otterdrive-test-${Date.now()}`
  const location = {
    account: 'devstoreaccount1',
    container,
    prefix: 'drive/',
    endpoint: AZURE,
  }
  beforeAll(async () => {
    const url = new URL(`${AZURE}/${container}?restype=container`)
    const headers = new Headers({
      'x-ms-date': new Date().toUTCString(),
      'x-ms-version': '2021-08-06',
    })
    const signature = await sharedKeySignature(
      AZURITE_KEY,
      'devstoreaccount1',
      'PUT',
      url,
      headers,
    )
    headers.set('authorization', `SharedKey devstoreaccount1:${signature}`)
    const response = await fetch(url, { method: 'PUT', headers })
    expect(response.status).toBe(201)
  })
  exercise('azure', () => azureDriver(location, { accountKey: AZURITE_KEY }))
  it('azure: reports the provider’s reason for a refusal', async () => {
    const storage = azureDriver(location, {
      accountKey: btoa('not the key'),
    })
    await expect(storage.head('nothing')).rejects.toThrow(/refused/)
  })
})

/**
 * A real Cloud Storage bucket, through its XML API and an HMAC key:
 *   STORAGE_TEST_GCS_BUCKET, STORAGE_TEST_GCS_KEY, STORAGE_TEST_GCS_SECRET
 */
const GCS_BUCKET = process.env.STORAGE_TEST_GCS_BUCKET
describe.runIf(GCS_BUCKET)('GCS driver against Cloud Storage', () => {
  const credentials = {
    accessKeyId: process.env.STORAGE_TEST_GCS_KEY ?? '',
    secretAccessKey: process.env.STORAGE_TEST_GCS_SECRET ?? '',
  }
  exercise('gcs', () =>
    driverFor(
      { provider: 'gcs', bucket: GCS_BUCKET!, prefix: 'drivers-test/' },
      credentials,
    ),
  )
  it('gcs: passes the check Drive runs before connecting', async () => {
    await probeStorage(
      driverFor(
        { provider: 'gcs', bucket: GCS_BUCKET!, prefix: 'drivers-test/' },
        credentials,
      ),
    )
  })
})
