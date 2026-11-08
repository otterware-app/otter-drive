import { describe, expect, it } from 'vitest'
import { preflight, withCors } from './cors'

const request = (origin?: string, method = 'GET') =>
  new Request('https://drive.otterware.app/api/v1/artifacts', {
    method,
    headers: origin ? { origin } : {},
  })

describe('cross-origin access for Otter', () => {
  it('lets Otter read responses, at its new and old addresses, without credentials', () => {
    for (const origin of [
      'https://otter.otterware.app',
      'https://mail.otterware.app',
    ]) {
      const response = withCors(request(origin), Response.json({ data: [] }))
      expect(response.headers.get('access-control-allow-origin')).toBe(origin)
      expect(
        response.headers.get('access-control-allow-credentials'),
      ).toBeNull()
    }
  })

  it('leaves other origins and same-origin requests alone', () => {
    for (const origin of ['https://evil.example', undefined]) {
      const response = withCors(request(origin), Response.json({}))
      expect(response.headers.get('access-control-allow-origin')).toBeNull()
    }
  })

  it('answers preflights only for allowed origins', () => {
    const allowed = preflight(request('https://mail.otterware.app', 'OPTIONS'))
    expect(allowed.status).toBe(204)
    expect(allowed.headers.get('access-control-allow-headers')).toContain(
      'authorization',
    )
    expect(preflight(request('https://evil.example', 'OPTIONS')).status).toBe(
      403,
    )
  })
})
