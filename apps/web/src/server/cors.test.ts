import { describe, expect, it } from 'vitest'
import { preflight, withCors } from './cors'

const request = (origin?: string, method = 'GET') =>
  new Request('https://drive.otterware.app/api/v1/artifacts', {
    method,
    headers: origin ? { origin } : {},
  })

describe('cross-origin access for Otter Mail', () => {
  it('lets Otter Mail read responses, without credentials', () => {
    const response = withCors(
      request('https://mail.otterware.app'),
      Response.json({ data: [] }),
    )
    expect(response.headers.get('access-control-allow-origin')).toBe(
      'https://mail.otterware.app',
    )
    expect(response.headers.get('access-control-allow-credentials')).toBeNull()
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
