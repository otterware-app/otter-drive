import { env } from 'cloudflare:workers'
import { createFileRoute } from '@tanstack/react-router'
import { identityRequest } from '#/server/identity'

export const Route = createFileRoute('/api/identity/$')({
  server: {
    handlers: {
      POST: ({ request }) => identityRequest(request, env),
      GET: ({ request }) =>
        new URL(request.url).pathname === '/api/identity/account'
          ? Response.redirect(
              new URL('/otter/account', env.OTTER_AUTH_URL).toString(),
              302,
            )
          : new Response(null, { status: 404 }),
    },
  },
})
