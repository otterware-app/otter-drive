import { apiKey } from '@better-auth/api-key'
import { betterAuth } from 'better-auth'
import { APIError } from 'better-auth/api'
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
            await env.DB.prepare(
              `UPDATE drive_member SET user_id = ? WHERE user_id IS NULL AND email = (SELECT lower(email) FROM user WHERE id = ? AND emailVerified = 1)`,
            )
              .bind(session.userId, session.userId)
              .run()
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
