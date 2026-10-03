import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { Env } from './types'

const keys = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

function otterKeys(env: Env) {
  const url = `${env.OTTER_AUTH_URL}/jwks`
  let value = keys.get(url)
  if (!value) {
    value = createRemoteJWKSet(new URL(url))
    keys.set(url, value)
  }
  return value
}

async function verify(env: Env, token: string, maxTokenAge?: string) {
  return (
    await jwtVerify(token, otterKeys(env), {
      // Existing Mail sessions may send a final logout during issuer cutover.
      // Keys always come from the configured Accounts service, never the token.
      issuer:
        env.OTTER_AUTH_URL === 'https://accounts.otterware.app/v1/auth'
          ? [env.OTTER_AUTH_URL, 'https://relay.mail.otterware.app/v1/auth']
          : env.OTTER_AUTH_URL,
      audience: 'otter-drive',
      algorithms: ['RS256'],
      clockTolerance: 5,
      ...(maxTokenAge ? { maxTokenAge } : {}),
    })
  ).payload
}

export async function identityRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  const path = new URL(request.url).pathname
  if (request.method !== 'POST') return new Response(null, { status: 405 })
  try {
    if (path.endsWith('/logout')) {
      const form = await request.formData()
      const token = form.get('logout_token')
      if (typeof token !== 'string') return new Response(null, { status: 400 })
      const claims = await verify(env, token, '2 minutes')
      const events = claims.events as Record<string, unknown> | undefined
      if (
        !claims.sub ||
        typeof claims.sid !== 'string' ||
        !claims.jti ||
        claims.nonce !== undefined ||
        !events?.['http://schemas.openid.net/event/backchannel-logout']
      )
        return new Response(null, { status: 400 })
      const results = await env.DB.batch([
        env.DB.prepare(
          'DELETE FROM otter_logout_token WHERE expiresAt < ?',
        ).bind(Date.now()),
        env.DB.prepare(
          'INSERT OR IGNORE INTO otter_logout_token (id, expiresAt) VALUES (?, ?)',
        ).bind(claims.jti, Date.now() + 180_000),
      ])
      if (!results[1]?.meta.changes) return new Response(null, { status: 400 })
      await env.DB.prepare(
        "DELETE FROM session WHERE otterSessionId = ? AND userId IN (SELECT userId FROM account WHERE providerId = 'otter' AND accountId = ?)",
      )
        .bind(claims.sid, claims.sub)
        .run()
      return new Response(null, { status: 204 })
    }
    if (!path.endsWith('/delete')) return new Response(null, { status: 404 })
    const token = request.headers.get('authorization')?.replace(/^Bearer /, '')
    if (!token) return new Response(null, { status: 401 })
    const claims = await verify(env, token, '90 seconds')
    if (
      claims.event !== 'otter.account.delete' ||
      !claims.sub ||
      !claims.jti ||
      !claims.exp
    )
      return new Response(null, { status: 400 })
    return deleteIdentity(env, claims.sub)
  } catch {
    return new Response(null, { status: 401 })
  }
}

/** D1 executes the guard, tombstone, and deletion as one transaction. */
export async function deleteIdentity(
  env: Env,
  subject: string,
): Promise<Response> {
  const account = await env.DB.prepare(
    "SELECT userId FROM account WHERE providerId = 'otter' AND accountId = ?",
  )
    .bind(subject)
    .first<{ userId: string }>()
  if (!account) return new Response(null, { status: 204 })
  const result = await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO otter_identity_deleted(subject,deletedAt)
      SELECT ?,? WHERE NOT EXISTS(SELECT 1 FROM artifact WHERE owner_user_id=?)
      AND NOT EXISTS(SELECT 1 FROM folder WHERE owner_user_id=? AND kind='shared')`,
    ).bind(subject, new Date().toISOString(), account.userId, account.userId),
    env.DB.prepare(
      `DELETE FROM folder WHERE owner_user_id=? AND EXISTS(SELECT 1 FROM otter_identity_deleted WHERE subject=?)`,
    ).bind(account.userId, subject),
    env.DB.prepare(
      `DELETE FROM apikey WHERE referenceId=? AND EXISTS(SELECT 1 FROM otter_identity_deleted WHERE subject=?)`,
    ).bind(account.userId, subject),
    env.DB.prepare(
      `DELETE FROM user WHERE id=? AND EXISTS(SELECT 1 FROM otter_identity_deleted WHERE subject=?)`,
    ).bind(account.userId, subject),
  ])
  if (!result[3]?.meta.changes)
    return Response.json(
      {
        message:
          'Delete your Drive documents and shared drives before deleting your Otter account. Shared drives with collaborators must first be transferred to another owner.',
      },
      { status: 409 },
    )
  return new Response(null, { status: 204 })
}
