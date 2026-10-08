import { apiKey } from '@better-auth/api-key'
import { betterAuth } from 'better-auth'
import {
  APIError,
  createAuthEndpoint,
  createAuthMiddleware,
} from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'
import {
  admin as adminPlugin,
  bearer,
  deviceAuthorization,
  genericOAuth,
} from 'better-auth/plugins'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { authorizeNewUser, normalizeEmail } from './auth-policy'
import { isPreviewHost } from './host-policy'
import type { Env } from './types'

export function createAuth(env: Env) {
  // Bind each callback to its verified token, even when a user signs in on
  // two browsers concurrently and the stored provider token gets replaced.
  const otterSessions = new WeakMap<object, { sid: string; sub: string }>()
  return betterAuth({
    appName: 'Otter Drive',
    baseURL: env.APP_URL,
    basePath: '/api/auth',
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: (request) => {
      // PR preview deployments serve the app on the worker's own
      // *.workers.dev version URL; trust that same-origin host only.
      if (!request) return [env.APP_URL]
      const { hostname, origin } = new URL(request.url)
      return isPreviewHost(hostname) ? [env.APP_URL, origin] : [env.APP_URL]
    },
    session: {
      expiresIn: 60 * 60 * 24 * 90,
      additionalFields: {
        otterSessionId: { type: 'string', required: false, input: false },
      },
    },
    emailAndPassword: { enabled: false },
    // Existing users are linked by the migration, never by an email match.
    account: { accountLinking: { enabled: false } },
    user: {
      validateUserInfo: async ({ user, source }, context) => {
        if (!user.emailVerified)
          return {
            error: 'email_not_verified',
            errorDescription: 'Verify your Google email before signing in.',
          }
        const subject = source.oauth?.profile?.sub
        const sid = source.oauth?.profile?.sid
        if (
          source.oauth?.providerId !== 'otter' ||
          typeof subject !== 'string' ||
          typeof sid !== 'string'
        )
          return {
            error: 'invalid_identity',
            errorDescription: 'Sign in with your Otter account.',
          }
        const deleted = await env.DB.prepare(
          'SELECT subject FROM otter_identity_deleted WHERE subject = ?',
        )
          .bind(subject)
          .first()
        if (deleted)
          return {
            error: 'account_deleted',
            errorDescription: 'This Otter account has been deleted.',
          }
        otterSessions.set(context.context, { sid, sub: subject })
      },
    },
    databaseHooks: {
      session: {
        create: {
          after: async (session) => {
            // Memberships and shares name an email until its owner signs in.
            await env.DB.batch(
              ['drive_member', 'share'].map((table) =>
                env.DB.prepare(
                  `UPDATE ${table} SET user_id = ? WHERE user_id IS NULL AND email = (SELECT lower(email) FROM user WHERE id = ? AND emailVerified = 1)`,
                ).bind(session.userId, session.userId),
              ),
            )
          },
          before: async (session, context) => ({
            data: {
              ...session,
              ...(context && otterSessions.has(context.context)
                ? { otterSessionId: otterSessions.get(context.context)?.sid }
                : {}),
            },
          }),
        },
      },
      user: {
        create: {
          before: async (user, context) => {
            const identity = context
              ? otterSessions.get(context.context)
              : undefined
            if (!identity)
              throw new APIError('FORBIDDEN', {
                message: 'Create your account with Otter sign-in.',
              })
            return {
              data: {
                ...user,
                id: identity.sub,
                email: normalizeEmail(user.email),
                role: await authorizeNewUser(env, user.email),
              },
            }
          },
        },
      },
    },
    advanced: {
      cookiePrefix: 'otterdrive',
      database: { generateId: () => crypto.randomUUID() },
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: 'lax',
        secure: env.APP_URL.startsWith('https://'),
      },
    },
    plugins: [
      {
        id: 'otter-suite-session',
        hooks: {
          after: [
            {
              matcher: (ctx: { path?: string }) => ctx.path === '/get-session',
              handler: createAuthMiddleware(async (ctx) => {
                const returned: unknown = ctx.context.returned
                if (
                  !returned ||
                  typeof returned !== 'object' ||
                  !('session' in returned)
                )
                  return
                const device = returned.session as {
                  id: string
                  token: string
                  userId: string
                } | null
                if (!device) return
                const linked = await env.DB.prepare(
                  'SELECT accounts_token, expires_at FROM otter_suite_session WHERE session_id = ?',
                )
                  .bind(device.id)
                  .first<{ accounts_token: string; expires_at: number }>()
                if (!linked) return
                if (linked.expires_at <= Date.now()) {
                  await ctx.context.internalAdapter.deleteSession(device.token)
                  return ctx.json(null)
                }
                // This private table never appears in the browser's session JSON.
                const response = await fetch(
                  `${env.OTTER_AUTH_URL}/get-session`,
                  {
                    headers: {
                      authorization: `Bearer ${linked.accounts_token}`,
                    },
                    redirect: 'error',
                    signal: AbortSignal.timeout(10_000),
                  },
                )
                if (!response.ok) throw new APIError('SERVICE_UNAVAILABLE')
                const parent = (await response.json()) as {
                  user?: { id: string }
                  session?: { expiresAt: string }
                } | null
                if (
                  parent?.user?.id === device.userId &&
                  new Date(parent.session?.expiresAt ?? '').getTime() >
                    Date.now()
                ) {
                  // Prevent the default sliding session lifetime from extending this grant.
                  await env.DB.prepare(
                    'UPDATE session SET expiresAt = ? WHERE id = ?',
                  )
                    .bind(new Date(linked.expires_at).toISOString(), device.id)
                    .run()
                  return ctx.json({
                    ...returned,
                    session: {
                      ...device,
                      expiresAt: new Date(linked.expires_at),
                    },
                  })
                }
                await ctx.context.internalAdapter.deleteSession(device.token)
                return ctx.json(null)
              }),
            },
          ],
        },
        endpoints: {
          suiteSession: createAuthEndpoint(
            '/suite-session',
            { method: 'POST' },
            async (ctx) => {
              const authorization = ctx.headers?.get('authorization')
              if (!authorization?.startsWith('Bearer '))
                throw new APIError('UNAUTHORIZED')
              // Only the configured Accounts host can attest the canonical identity.
              const response = await fetch(
                `${env.OTTER_AUTH_URL}/get-session`,
                {
                  headers: { authorization },
                  redirect: 'error',
                  signal: AbortSignal.timeout(10_000),
                },
              )
              if (!response.ok) throw new APIError('UNAUTHORIZED')
              const identity = (await response.json()) as {
                user?: {
                  id: string
                  email: string
                  emailVerified: boolean
                  name?: string
                  image?: string | null
                }
                session?: { id: string; expiresAt: string }
              } | null
              const expiresAt = new Date(identity?.session?.expiresAt ?? '')
              if (
                !identity?.user?.id ||
                !identity.session?.id ||
                !identity.user.emailVerified ||
                !Number.isFinite(expiresAt.getTime()) ||
                expiresAt.getTime() <= Date.now()
              )
                throw new APIError('UNAUTHORIZED')
              const subject = identity.user.id
              const deleted = await env.DB.prepare(
                'SELECT subject FROM otter_identity_deleted WHERE subject = ?',
              )
                .bind(subject)
                .first()
              if (deleted) throw new APIError('UNAUTHORIZED')
              otterSessions.set(ctx.context, {
                sid: identity.session.id,
                sub: subject,
              })
              let user = await ctx.context.internalAdapter.findUserById(subject)
              if (!user) {
                // Never link identities by email. Existing accounts keep their canonical ID.
                user = await ctx.context.internalAdapter.createUser(
                  {
                    id: subject,
                    email: normalizeEmail(identity.user.email),
                    emailVerified: true,
                    name: identity.user.name || identity.user.email,
                    image: identity.user.image ?? null,
                  },
                  {
                    method: 'oauth',
                    oauth: {
                      providerId: 'otter',
                      profile: { sub: subject, sid: identity.session.id },
                    },
                  },
                )
                await ctx.context.internalAdapter.createAccount({
                  userId: subject,
                  accountId: subject,
                  providerId: 'otter',
                })
              }
              if (!user || ('banned' in user && user.banned))
                throw new APIError('FORBIDDEN')
              const device = await ctx.context.internalAdapter.createSession(
                subject,
                false,
                { expiresAt, otterSessionId: identity.session.id },
                true,
              )
              if (!device) throw new APIError('INTERNAL_SERVER_ERROR')
              await env.DB.prepare(
                'INSERT INTO otter_suite_session (session_id, accounts_token, expires_at) VALUES (?, ?, ?)',
              )
                .bind(
                  device.id,
                  authorization.slice(7),
                  device.expiresAt.getTime(),
                )
                .run()
              await env.DB.prepare(
                'DELETE FROM session WHERE id IN (SELECT session_id FROM otter_suite_session WHERE expires_at < ?)',
              )
                .bind(Date.now())
                .run()
              await setSessionCookie(ctx, { session: device, user })
              return ctx.json({
                token: device.token,
                user: { id: user.id, email: user.email, name: user.name },
                expiresAt: device.expiresAt.getTime(),
              })
            },
          ),
        },
      },
      genericOAuth({
        config: [
          {
            providerId: 'otter',
            name: 'Otter',
            clientId: 'otter-drive',
            discoveryUrl: `${env.OTTER_AUTH_URL}/.well-known/openid-configuration`,
            requireIdTokenVerification: true,
            tokenEndpointAuth: { method: 'none' },
            scopes: ['openid', 'profile', 'email'],
            pkce: true,
            // The browser logout coordinator visits all three cookie owners.
            // Bearer/CLI sign-out continues to end only its own local session.
            disableProviderLogout: true,
          },
        ],
      }),
      adminPlugin({ defaultRole: 'user', adminRoles: ['admin'] }),
      deviceAuthorization({
        verificationUri: '/device',
        validateClient: (clientId) =>
          ['otterdrive-cli', 'otterware-cli'].includes(clientId),
      }),
      bearer(),
      apiKey({
        configId: 'user',
        references: 'user',
        defaultPrefix: 'otw_',
        requireName: true,
        apiKeyHeaders: ['x-api-key'],
        rateLimit: {
          enabled: true,
          timeWindow: 60_000,
          maxRequests: 600,
        },
        permissions: {
          defaultPermissions: {
            artifact: ['create', 'read', 'update'],
          },
        },
      }),
      tanstackStartCookies(),
    ],
  })
}

export type OtterDriveAuth = ReturnType<typeof createAuth>
