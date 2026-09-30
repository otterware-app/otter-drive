import { describe, expect, it } from 'vitest'
import { isAllowedHostPath, migrateLegacyRequest } from './host-policy'
import type { Env } from './types'

const env = {
  APP_URL: 'https://drive.otterware.app',
  CONTENT_URL: 'https://usercontent.otterware.app',
} as Env

describe('legacy domains', () => {
  it.each(['app.otterware.dev', 'drive.otterware.dev'])(
    'redirects browser links on %s with their path and query',
    (host) => {
      const response = migrateLegacyRequest(
        new Request(`https://${host}/team/a/report/?version=2`),
        env,
      ) as Response
      expect(response.status).toBe(308)
      expect(response.headers.get('location')).toBe(
        'https://drive.otterware.app/team/a/report/?version=2',
      )
    },
  )

  it.each(['app.otterware.dev', 'drive.otterware.dev'])(
    'preserves authenticated API calls on %s',
    async (host) => {
      const request = new Request(`https://${host}/api/v1/uploads?version=2`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer existing-token',
          'x-api-key': 'otw_existing',
          'content-type': 'application/json',
          'x-otterdrive-organization': 'existing-org',
        },
        body: JSON.stringify({ title: 'Report' }),
      })
      const migrated = migrateLegacyRequest(request, env) as Request
      expect(migrated.url).toBe(
        'https://drive.otterware.app/api/v1/uploads?version=2',
      )
      expect(migrated.method).toBe('POST')
      expect([...migrated.headers]).toEqual([...request.headers])
      expect(await migrated.json()).toEqual({ title: 'Report' })
      expect(isAllowedHostPath(migrated, env)).toBe(true)
    },
  )

  it('keeps raw content on the separate content origin', () => {
    const response = migrateLegacyRequest(
      new Request(
        'https://usercontent.otterware.dev/raw/session/signed-grant?file=index.html',
      ),
      env,
    ) as Response
    expect(response.status).toBe(308)
    expect(response.headers.get('location')).toBe(
      'https://usercontent.otterware.app/raw/session/signed-grant?file=index.html',
    )
    expect(
      isAllowedHostPath(
        new Request('https://drive.otterware.app/raw/session/signed-grant'),
        env,
      ),
    ).toBe(false)
  })

  it.each([
    'https://drive.otterware.app/api/v1/me',
    'https://drive.otterware.dev.example/api/v1/me',
    'http://localhost:3000/api/v1/me',
  ])('does not rewrite %s', (url) => {
    const request = new Request(url)
    expect(migrateLegacyRequest(request, env)).toBe(request)
  })
})
