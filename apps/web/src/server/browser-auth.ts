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
      `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; form-action ${accounts}; frame-ancestors 'none'; base-uri 'none'`,
    )
    // Accounts comes only from the deployment config, never a request parameter.
    const action = `${accounts}/otter/sign-out`
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
    return new Response(
      `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <title>Signing out · Otter</title>
    <style nonce="${nonce}">
:root {
  color-scheme: light dark;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
  --canvas: light-dark(#fff, #181818);
  --frame: light-dark(#f9f9f9, #202020);
  --text: light-dark(#0d0d0d, #ececec);
  --muted: light-dark(#5d5d5d, #a3a3a3);
  --line: light-dark(#e8e8e8, #2c2c2c);
  background: var(--frame);
  color: var(--text);
}
* { box-sizing: border-box; }
body { margin: 0; }
header { height: 42px; padding: 12px 16px; font-size: 14px; font-weight: 500; letter-spacing: -.025em; }
main { min-height: calc(100svh - 46px); margin: 0 4px 4px; border: 1px solid var(--line); border-radius: 12px; background: var(--canvas); display: grid; place-items: center; padding: 32px; }
.status { width: 100%; max-width: 360px; text-align: center; }
h1 { margin: 20px 0 10px; font-size: 24px; font-weight: 500; letter-spacing: -.035em; }
p { margin: 0; color: var(--muted); font-size: 14px; line-height: 1.6; }
.spinner { width: 24px; height: 24px; margin: auto; border: 2px solid var(--line); border-top-color: var(--text); border-radius: 50%; animation: spin .8s linear infinite; }
form { margin-top: 24px; }
button { font: inherit; font-size: 14px; padding: 10px 16px; border: 1px solid var(--line); border-radius: 8px; background: var(--canvas); color: var(--text); cursor: pointer; }
button:focus-visible { outline: 2px solid var(--text); outline-offset: 3px; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
    </style>
  </head>
  <body>
    <header>Otter</header>
    <main>
      <div class="status" role="status">
        <div class="spinner" aria-hidden="true"></div>
        <h1>Signing out…</h1>
        <p>Just a moment.</p>
        <form method="post" action="${action}">
          <input type="hidden" name="app" value="drive">
          <button>Continue signing out</button>
        </form>
      </div>
    </main>
    <script nonce="${nonce}">const form = document.querySelector('form'); form.hidden = true; setTimeout(() => { form.hidden = false; }, 1500); form.requestSubmit();</script>
  </body>
</html>`,
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
