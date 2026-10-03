import { createServer } from 'node:http'
import { Database } from './test-database'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAuth } from './auth'
import { authenticate } from './actor'
import { deleteIdentity, identityRequest } from './identity'
import { browserAuth } from './browser-auth'
import type { Env } from './types'

let server: ReturnType<typeof createServer>
let issuer: string
let signingKey: CryptoKey
let jwk: Awaited<ReturnType<typeof exportJWK>>
const codes = new Map<
  string,
  {
    nonce: string
    challenge: string
    sub: string
    email: string
    verified: boolean
  }
>()
let db: Database
let env: Env

beforeAll(async () => {
  const pair = await generateKeyPair('RS256')
  signingKey = pair.privateKey
  jwk = { ...(await exportJWK(pair.publicKey)), kid: 'test', alg: 'RS256' }
  server = createServer(async (request, response) => {
    response.setHeader('content-type', 'application/json')
    if (request.url?.endsWith('/jwks')) {
      response.end(JSON.stringify({ keys: [jwk] }))
      return
    }
    if (request.url?.includes('openid-configuration')) {
      response.end(
        JSON.stringify({
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          jwks_uri: `${issuer}/jwks`,
          userinfo_endpoint: `${issuer}/userinfo`,
          id_token_signing_alg_values_supported: ['RS256'],
        }),
      )
      return
    }
    let body = ''
    for await (const chunk of request) body += chunk
    const form = new URLSearchParams(body)
    const code = codes.get(form.get('code') ?? '')
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(form.get('code_verifier') ?? ''),
    )
    if (
      !code ||
      Buffer.from(digest).toString('base64url') !== code.challenge ||
      form.get('client_id') !== 'otter-drive'
    ) {
      response.writeHead(400)
      response.end(JSON.stringify({ error: 'invalid_grant' }))
      return
    }
    codes.delete(form.get('code')!)
    const idToken = await new SignJWT({
      email: code.email,
      email_verified: code.verified,
      name: 'Otter User',
      nonce: code.nonce,
      sid: 'otter-browser',
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .setIssuer(issuer)
      .setAudience('otter-drive')
      .setSubject(code.sub)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(signingKey)
    response.end(
      JSON.stringify({
        access_token: 'test-access-token',
        token_type: 'Bearer',
        expires_in: 300,
        id_token: idToken,
      }),
    )
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  issuer = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1/auth`
})
afterAll(() => server.close())
beforeEach(() => {
  db?.sqlite.close()
  db = new Database()
  env = {
    APP_URL: 'http://drive.test',
    OTTER_AUTH_URL: issuer,
    MAIL_AUTH_URL: 'http://relay.mail.test',
    MAIL_URL: 'http://mail.test',
    BETTER_AUTH_SECRET: 'test-drive-auth-secret-at-least-32-characters',
    ADMIN_EMAIL: 'owner@example.com',
    DB: db as unknown as D1Database,
  } as Env
  const date = new Date().toISOString()
  db.sqlite
    .prepare(
      'INSERT INTO user (id,name,email,emailVerified,createdAt,updatedAt,role) VALUES (?,?,?,?,?,?,?)',
    )
    .run(
      'stable-otter-id',
      'Original owner',
      'owner@example.com',
      1,
      date,
      date,
      'admin',
    )
  db.sqlite
    .prepare(
      'INSERT INTO account (id,accountId,providerId,userId,createdAt,updatedAt) VALUES (?,?,?,?,?,?)',
    )
    .run(
      'otter-link',
      'stable-otter-id',
      'otter',
      'stable-otter-id',
      date,
      date,
    )
  db.sqlite
    .prepare(
      'INSERT INTO folder(id,name,slug,owner_user_id,parent_id,kind,created_at,updated_at) VALUES(?,?,?,?,NULL,?,?,?)',
    )
    .run(
      'folder',
      'My drive',
      'my-drive',
      'stable-otter-id',
      'personal',
      date,
      date,
    )
})
afterAll(() => db?.sqlite.close())

function cookies(response: Response) {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ')
}
async function login(
  sub = 'stable-otter-id',
  email = 'owner@example.com',
  verified = true,
) {
  const auth = createAuth(env)
  const start = await auth.handler(
    new Request(`${env.APP_URL}/api/auth/sign-in/social`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: env.APP_URL },
      body: JSON.stringify({
        provider: 'otter',
        callbackURL: '/home',
        disableRedirect: true,
      }),
    }),
  )
  expect(start.status).toBe(200)
  const url = new URL(((await start.json()) as { url: string }).url)
  expect(url.searchParams.get('code_challenge_method')).toBe('S256')
  const code = crypto.randomUUID()
  codes.set(code, {
    nonce: url.searchParams.get('nonce')!,
    challenge: url.searchParams.get('code_challenge')!,
    sub,
    email,
    verified,
  })
  const callback = new URL(`${env.APP_URL}/api/auth/callback/otter`)
  callback.search = new URLSearchParams({
    code,
    state: url.searchParams.get('state')!,
    iss: issuer,
  }).toString()
  return {
    auth,
    response: await auth.handler(
      new Request(callback, { headers: { cookie: cookies(start) } }),
    ),
  }
}
async function eventToken(
  payload: Record<string, unknown>,
  audience = 'otter-drive',
) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime('1m')
    .setJti(crypto.randomUUID())
    .sign(signingKey)
}

describe('shared Otter identity', () => {
  it('clears the current browser including a legacy session, preserving another device and API keys', async () => {
    const here = await login()
    const elsewhere = await login()
    const hereHeaders = new Headers({ cookie: cookies(here.response) })
    const otherHeaders = new Headers({ cookie: cookies(elsewhere.response) })
    const current = await here.auth.api.getSession({ headers: hereHeaders })
    db.sqlite
      .prepare('UPDATE session SET otterSessionId=NULL WHERE id=?')
      .run(current!.session.id)
    const key = await here.auth.api.createApiKey({
      headers: hereHeaders,
      body: { configId: 'user', name: 'Agent' },
    })
    const started = await browserAuth(
      new Request(`${env.APP_URL}/api/auth/browser-sign-out/start`, {
        method: 'POST',
        headers: { origin: env.APP_URL },
      }),
      env,
      here.auth,
    )
    expect(started!.headers.get('referrer-policy')).toBe('strict-origin')
    expect(await started!.text()).toContain(
      `action="${new URL(issuer).origin}/otter/sign-out"`,
    )
    for (const origin of [
      'http://evil.test',
      'https://usercontent.otterware.app',
      '',
    ]) {
      expect(
        (
          await browserAuth(
            new Request(`${env.APP_URL}/api/auth/browser-sign-out`, {
              method: 'POST',
              headers: { origin, cookie: cookies(here.response) },
              body: new URLSearchParams({ app: 'drive' }),
            }),
            env,
            here.auth,
          )
        )?.status,
      ).toBe(403)
    }
    const logout = await browserAuth(
      new Request(`${env.APP_URL}/api/auth/browser-sign-out`, {
        method: 'POST',
        headers: { origin: env.MAIL_AUTH_URL, cookie: cookies(here.response) },
        body: new URLSearchParams({ app: 'drive' }),
      }),
      env,
      here.auth,
    )
    expect(logout?.status).toBe(303)
    expect(logout?.headers.get('location')).toBe(
      `${env.APP_URL}/login?signed_out=1`,
    )
    expect(logout?.headers.get('set-cookie')).toContain('Max-Age=0')
    expect(await here.auth.api.getSession({ headers: hereHeaders })).toBeNull()
    expect(
      await here.auth.api.getSession({ headers: otherHeaders }),
    ).not.toBeNull()
    expect(
      (
        await here.auth.api.verifyApiKey({
          body: { key: key.key, configId: 'user' },
        })
      ).valid,
    ).toBe(true)
  })

  it('only completes browser logout for a trusted POST and fixed app destination', async () => {
    const { auth } = await login()
    expect(
      (
        await browserAuth(
          new Request(`${env.APP_URL}/api/auth/browser-sign-out`),
          env,
          auth,
        )
      )?.status,
    ).toBe(405)
    expect(
      (
        await browserAuth(
          new Request(`${env.APP_URL}/api/auth/browser-sign-out`, {
            method: 'POST',
            headers: { origin: env.MAIL_AUTH_URL },
            body: new URLSearchParams({ app: 'https://evil.test' }),
          }),
          env,
          auth,
        )
      )?.status,
    ).toBe(400)
    for (const [app, destination] of [
      ['mail', `${env.MAIL_URL}/?signed_out=1`],
      ['accounts', `${new URL(issuer).origin}/otter/sign-in?signed_out=1`],
    ] as const) {
      const response = await browserAuth(
        new Request(`${env.APP_URL}/api/auth/browser-sign-out`, {
          method: 'POST',
          headers: { origin: env.MAIL_AUTH_URL },
          body: new URLSearchParams({ app }),
        }),
        env,
        auth,
      )
      expect(response?.status).toBe(303)
      expect(response?.headers.get('location')).toBe(destination)
    }
  })

  it('uses the canonical Mail user and personal API keys when signing in through Otter', async () => {
    const { auth, response } = await login()
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/home')
    const headers = new Headers({ cookie: cookies(response) })
    const session = await auth.api.getSession({ headers })
    expect(session?.user.id).toBe('stable-otter-id')
    expect(
      db.sqlite.prepare('SELECT otterSessionId FROM session').get()
        ?.otterSessionId,
    ).toBe('otter-browser')
    const actor = await authenticate(
      new Request(`${env.APP_URL}/api/v1/me`, { headers }),
      env,
      auth,
    )
    expect(actor).toMatchObject({
      userId: 'stable-otter-id',
      folderId: 'folder',
      roles: ['owner'],
    })
    const key = await auth.api.createApiKey({
      headers,
      body: {
        configId: 'user',
        name: 'Existing integration',
      },
    })
    const apiActor = await authenticate(
      new Request(`${env.APP_URL}/api/v1/me`, {
        headers: { 'x-api-key': key.key },
      }),
      env,
      auth,
    )
    expect(apiActor).toMatchObject({ type: 'api_key', folderId: 'folder' })
    const logoutToken = await eventToken({
      sub: 'stable-otter-id',
      sid: 'otter-browser',
      events: { 'http://schemas.openid.net/event/backchannel-logout': {} },
    })
    const logout = () =>
      identityRequest(
        new Request(`${env.APP_URL}/api/identity/logout`, {
          method: 'POST',
          body: new URLSearchParams({ logout_token: logoutToken }),
        }),
        env,
      )
    expect((await logout()).status).toBe(204)
    expect(await auth.api.getSession({ headers })).toBeNull()
    expect((await logout()).status).toBe(400)
    expect(
      (
        await auth.api.verifyApiKey({
          body: { key: key.key, configId: 'user' },
        })
      ).valid,
    ).toBe(true)
  })
  it('keeps browser-approved CLI device login working with the shared account', async () => {
    const { auth, response } = await login()
    const headers = {
      cookie: cookies(response),
      origin: env.APP_URL,
      'content-type': 'application/json',
    }
    const call = (path: string, body: object, authenticated = false) =>
      auth.handler(
        new Request(`${env.APP_URL}/api/auth${path}`, {
          method: 'POST',
          headers: authenticated
            ? headers
            : { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
      )
    const codeResponse = await call('/device/code', {
      client_id: 'otterdrive-cli',
      scope: 'openid profile email offline_access',
    })
    expect(codeResponse.status).toBe(200)
    const code = (await codeResponse.json()) as {
      user_code: string
      device_code: string
    }
    const claim = await auth.handler(
      new Request(
        `${env.APP_URL}/api/auth/device?user_code=${code.user_code}`,
        { headers },
      ),
    )
    expect(claim.status).toBe(200)
    const approved = await call(
      '/device/approve',
      { userCode: code.user_code },
      true,
    )
    expect(approved.status).toBe(200)
    const granted = await call('/device/token', {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: code.device_code,
      client_id: 'otterdrive-cli',
    })
    expect(granted.status, await granted.clone().text()).toBe(200)
    const token = (await granted.json()) as { access_token: string }
    const actor = await authenticate(
      new Request(`${env.APP_URL}/api/v1/me`, {
        headers: { authorization: `Bearer ${token.access_token}` },
      }),
      env,
      auth,
    )
    expect(actor.userId).toBe('stable-otter-id')
    expect(actor.folderId).toBe('folder')
  })
  it('does not link a new identity to an existing user just because the emails match', async () => {
    const { response } = await login('different-otter-id')
    expect(response.headers.get('location')).toContain('error=')
    expect(
      db.sqlite.prepare('SELECT count(*) AS count FROM session').get()?.count,
    ).toBe(0)
    expect(
      db.sqlite
        .prepare("SELECT accountId FROM account WHERE providerId='otter'")
        .get()?.accountId,
    ).toBe('stable-otter-id')
  })
  it('creates personal accounts using the verified Otter subject and rejects unverified identities', async () => {
    const { auth, response } = await login('new-person', 'new@example.com')
    expect(response.status).toBe(302)
    expect(
      (
        await auth.api.getSession({
          headers: new Headers({ cookie: cookies(response) }),
        })
      )?.user.id,
    ).toBe('new-person')
    expect(
      (
        await login('unverified', 'unverified@example.com', false)
      ).response.headers.get('location'),
    ).toContain('error=')
    expect(
      db.sqlite.prepare('SELECT count(*) AS count FROM user').get()?.count,
    ).toBe(2)
  })
  it('protects the last owner and deletes only the released identity', async () => {
    db.sqlite.exec("UPDATE folder SET kind='shared'")
    expect((await deleteIdentity(env, 'stable-otter-id')).status).toBe(409)
    expect(
      db.sqlite.prepare('SELECT count(*) AS count FROM user').get()?.count,
    ).toBe(1)
    db.sqlite.exec('DELETE FROM folder')
    const token = await eventToken({
      sub: 'stable-otter-id',
      event: 'otter.account.delete',
    })
    const request = () =>
      new Request(`${env.APP_URL}/api/identity/delete`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      })
    expect((await identityRequest(request(), env)).status).toBe(204)
    expect((await identityRequest(request(), env)).status).toBe(204)
    expect(
      db.sqlite.prepare('SELECT count(*) AS count FROM user').get()?.count,
    ).toBe(0)
    expect(
      db.sqlite.prepare('SELECT count(*) AS count FROM folder').get()?.count,
    ).toBe(0)
    expect((await login()).response.headers.get('location')).toContain('error=')
  })
  it('rejects lifecycle messages issued for another app', async () => {
    const token = await eventToken(
      { sub: 'stable-otter-id', event: 'otter.account.delete' },
      'other-app',
    )
    expect(
      (
        await identityRequest(
          new Request(`${env.APP_URL}/api/identity/delete`, {
            method: 'POST',
            headers: { authorization: `Bearer ${token}` },
          }),
          env,
        )
      ).status,
    ).toBe(401)
    expect(
      db.sqlite.prepare('SELECT count(*) AS count FROM user').get()?.count,
    ).toBe(1)
  })
})
