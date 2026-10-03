import { env } from 'cloudflare:workers'
import { createFileRoute } from '@tanstack/react-router'
import { authenticate } from '#/server/actor'
import { listFolders } from '#/server/folders'
import { errorResponse } from '#/server/http'
import { createAuth } from '#/server/auth'
import { browserAuth } from '#/server/browser-auth'

async function handler({ request }: { request: Request }) {
  const auth = createAuth(env)
  const browser = await browserAuth(request, env, auth)
  if (browser) return browser
  // Older installed CLIs can still discover/select their existing drives.
  if (
    new URL(request.url).pathname === '/api/auth/organization/list' &&
    request.method === 'GET'
  ) {
    try {
      const result = await listFolders(
        env,
        await authenticate(request, env, auth),
      )
      return Response.json(((await result.json()) as { data: unknown[] }).data)
    } catch (error) {
      return errorResponse(error)
    }
  }
  return auth.handler(request)
}

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: handler,
      POST: handler,
      PUT: handler,
      PATCH: handler,
      DELETE: handler,
    },
  },
})
