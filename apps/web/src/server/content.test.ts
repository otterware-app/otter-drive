import { describe, expect, it } from 'vitest'
import {
  requestedRange,
  serveRawContent,
  signContentGrant,
  signThumbnailGrant,
  startContentSession,
} from './content'
import type { Env } from './types'

function testEnv(): Env {
  return {
    APP_URL: 'http://localhost:3000',
    OTTER_AUTH_URL: 'http://localhost:8787/v1/auth',
    CONTENT_URL: 'http://localhost:3000',
    ADMIN_EMAIL: 'chris.kafrouni@gmail.com',
    BETTER_AUTH_SECRET: 'auth-secret-at-least-thirty-two-characters',
    CONTENT_SIGNING_KEY: 'content-secret-at-least-thirty-two-characters',
    GOOGLE_CLIENT_ID: '',
    GOOGLE_CLIENT_SECRET: '',
    DB: {} as D1Database,
    ARTIFACTS: {} as R2Bucket,
    ASSETS: {} as Fetcher,
    BROWSER: {} as BrowserRun,
  }
}

describe('content grants', () => {
  it('creates a scoped content session with a host-only cookie', async () => {
    const env = testEnv()
    const token = await signContentGrant(env, {
      principal: { service: true },
      artifactId: 'artifact-1',
      versionId: 'version-1',
      entryPath: 'index.html',
    })
    const response = await startContentSession(
      new Request(`http://localhost:3000/raw/session/${token}`),
      env,
      token,
    )

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/raw/a/artifact-1/version-1/index.html',
    )
    expect(response.headers.get('set-cookie')).toContain(
      'Path=/raw/a/artifact-1/version-1/',
    )
    expect(response.headers.get('set-cookie')).not.toContain('Domain=')
  })

  it('limits internal thumbnail renderer sessions to five minutes', async () => {
    const env = testEnv()
    const token = await signContentGrant(env, {
      principal: { service: true },
      artifactId: 'artifact-1',
      versionId: 'version-1',
      entryPath: 'demo.webm',
    })
    const response = await startContentSession(
      new Request(`http://localhost:3000/raw/session/${token}`),
      env,
      token,
    )
    const cookie = response.headers.get('set-cookie') ?? ''

    expect(cookie).toContain('Max-Age=300')
    expect(cookie).not.toContain(`otw_content=${token};`)
  })

  it('reuses thumbnail grants within a cache window', async () => {
    const env = testEnv()
    expect(await signThumbnailGrant(env, 'previews/artifact/version.jpg')).toBe(
      await signThumbnailGrant(env, 'previews/artifact/version.jpg'),
    )
  })
})

describe('content ranges', () => {
  it('reads the byte ranges media players ask for', () => {
    expect(requestedRange(null, 100)).toBeNull()
    expect(requestedRange('bytes=0-', 100)).toEqual({ offset: 0, length: 100 })
    expect(requestedRange('bytes=10-19', 100)).toEqual({
      offset: 10,
      length: 10,
    })
    expect(requestedRange('bytes=90-500', 100)).toEqual({
      offset: 90,
      length: 10,
    })
    expect(requestedRange('bytes=-30', 100)).toEqual({ offset: 70, length: 30 })
    expect(requestedRange('bytes=-300', 100)).toEqual({
      offset: 0,
      length: 100,
    })
  })

  it('serves whole files for ranges it does not understand', () => {
    expect(requestedRange('bytes=0-1,5-9', 100)).toBeNull()
    expect(requestedRange('items=0-1', 100)).toBeNull()
    expect(requestedRange('bytes=-', 100)).toBeNull()
    expect(requestedRange('bytes=20-10', 100)).toBeNull()
  })

  it('rejects ranges past the end of the file', () => {
    expect(requestedRange('bytes=100-', 100)).toBe('unsatisfiable')
    expect(requestedRange('bytes=-0', 100)).toBe('unsatisfiable')
    expect(requestedRange('bytes=0-', 0)).toBe('unsatisfiable')
  })

  async function serve(range?: string) {
    const env = testEnv()
    const bytes = new TextEncoder().encode('0123456789')
    const gets: unknown[] = []
    env.DB = {
      prepare: () => ({
        bind: () => ({
          first: async () => ({
            path: 'demo.webm',
            content_type: 'video/webm',
            size: bytes.length,
            r2_key: 'artifacts/demo.webm',
          }),
        }),
      }),
    } as unknown as D1Database
    env.ARTIFACTS = {
      get: async (
        _key: string,
        options?: { range?: { offset: number; length: number } },
      ) => {
        gets.push(options)
        const { offset = 0, length = bytes.length } = options?.range ?? {}
        return { body: bytes.slice(offset, offset + length) }
      },
    } as unknown as R2Bucket
    const token = await signContentGrant(env, {
      principal: { service: true },
      artifactId: 'artifact-1',
      versionId: 'version-1',
      entryPath: 'demo.webm',
    })
    const response = await serveRawContent(
      new Request(
        'http://localhost:3000/raw/a/artifact-1/version-1/demo.webm',
        {
          headers: {
            cookie: `otw_content=${token}`,
            ...(range ? { range } : {}),
          },
        },
      ),
      env,
      'artifact-1',
      'version-1',
      'demo.webm',
    )
    return { response, gets }
  }

  it('serves part of a file for a range request', async () => {
    const { response, gets } = await serve('bytes=2-5')

    expect(response.status).toBe(206)
    expect(response.headers.get('content-range')).toBe('bytes 2-5/10')
    expect(response.headers.get('content-length')).toBe('4')
    expect(response.headers.get('accept-ranges')).toBe('bytes')
    expect(gets).toEqual([{ range: { offset: 2, length: 4 } }])
    expect(await response.text()).toBe('2345')
  })

  it('serves the whole file, advertising ranges, without one', async () => {
    const { response } = await serve()

    expect(response.status).toBe(200)
    expect(response.headers.get('accept-ranges')).toBe('bytes')
    expect(response.headers.get('content-length')).toBe('10')
    expect(await response.text()).toBe('0123456789')
  })

  it('answers 416 for a range past the end', async () => {
    const { response, gets } = await serve('bytes=10-')

    expect(response.status).toBe(416)
    expect(response.headers.get('content-range')).toBe('bytes */10')
    expect(gets).toEqual([])
  })
})
