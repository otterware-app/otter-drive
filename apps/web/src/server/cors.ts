/**
 * Cross-origin access for Otter Mail's web app, which calls the API from
 * mail.otterware.app with a Bearer token. Credentials are never allowed: a
 * cross-origin request carries no Otter Drive cookies, so Better Auth skips
 * its origin check and only the token authorizes it.
 */
const ALLOWED_ORIGINS = new Set([
  'https://mail.otterware.app',
  // `pnpm dev` and `pnpm dev:fake` in Otter Mail.
  'http://localhost:5833',
])

const ALLOWED_HEADERS = [
  'authorization',
  'content-type',
  'x-api-key',
  'x-content-sha256',
  'x-otterdrive-folder',
  'x-otterdrive-organization',
].join(', ')

function allowedOrigin(request: Request): string | null {
  const origin = request.headers.get('origin')
  return origin && ALLOWED_ORIGINS.has(origin) ? origin : null
}

/** The answer to a preflight, or null when the origin isn't allowed. */
export function preflight(request: Request): Response {
  const origin = allowedOrigin(request)
  if (!origin) return new Response(null, { status: 403 })
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE',
      'access-control-allow-headers': ALLOWED_HEADERS,
      'access-control-max-age': '600',
      vary: 'origin',
    },
  })
}

/** The response, readable by an allowed origin. */
export function withCors(request: Request, response: Response): Response {
  const origin = allowedOrigin(request)
  if (!origin) return response
  const readable = new Response(response.body, response)
  readable.headers.set('access-control-allow-origin', origin)
  readable.headers.append('vary', 'origin')
  return readable
}
