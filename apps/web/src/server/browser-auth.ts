import type { OtterDriveAuth } from './auth'
import type { Env } from './types'

/** Front-channel logout clears this browser's cookie, including legacy sessions. */
export async function browserAuth(
  request: Request,
  env: Env,
  auth: OtterDriveAuth,
): Promise<Response | null> {
  const path = new URL(request.url).pathname
  const accounts = new URL(env.OTTER_AUTH_URL).origin
  if (path === '/api/auth/browser-session' && request.method === 'GET')
    return Response.json(
      { url: `${accounts}/otter/session` },
      { headers: { 'cache-control': 'no-store' } },
    )
  if (
    path !== '/api/auth/browser-sign-out/start' &&
    path !== '/api/auth/browser-sign-out'
  )
    return null
  if (request.method !== 'POST') return new Response(null, { status: 405 })
  const start = path.endsWith('/start')
  if (
    request.headers.get('origin') !== (start ? env.APP_URL : env.MAIL_AUTH_URL)
  )
    return new Response('Start sign-out from Otter.', { status: 403 })
  const headers = new Headers({
    'cache-control': 'no-store',
    // no-referrer would make the next form POST's Origin null.
    'referrer-policy': 'strict-origin',
  })
  if (start) {
    const nonce = crypto.randomUUID()
    headers.set('content-type', 'text/html; charset=utf-8')
    headers.set(
      'content-security-policy',
      `default-src 'none'; script-src 'nonce-${nonce}'; form-action ${accounts}; frame-ancestors 'none'; base-uri 'none'`,
    )
    // Accounts comes only from the deployment config, never a request parameter.
    const action = `${accounts}/otter/sign-out`
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
    return new Response(
      `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Signing out · Otter</title></head><body><h1>Signing out of Otter</h1><form method="post" action="${action}"><input type="hidden" name="app" value="drive"><button>Continue signing out</button></form><script nonce="${nonce}">document.querySelector('form').requestSubmit();</script></body></html>`,
      { headers },
    )
  }
  const app = (await request.formData()).get('app')
  if (app !== 'mail' && app !== 'drive' && app !== 'accounts')
    return new Response('Unknown app.', { status: 400 })
  const authHeaders = new Headers(request.headers)
  authHeaders.set('origin', env.APP_URL)
  authHeaders.set('content-type', 'application/json')
  authHeaders.delete('content-length')
  authHeaders.delete('authorization')
  const result = await auth.handler(
    new Request(`${env.APP_URL}/api/auth/sign-out`, {
      method: 'POST',
      headers: authHeaders,
      body: '{}',
    }),
  )
  if (!result.ok)
    return new Response('Could not sign out. Please try again.', {
      status: 502,
      headers,
    })
  for (const cookie of result.headers.getSetCookie())
    headers.append('set-cookie', cookie)
  headers.set(
    'location',
    app === 'mail'
      ? `${env.MAIL_URL}/?signed_out=1`
      : app === 'drive'
        ? `${env.APP_URL}/login?signed_out=1`
        : `${accounts}/otter/sign-in?signed_out=1`,
  )
  return new Response(null, { status: 303, headers })
}
