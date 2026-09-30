import type { OtterDriveAuth } from './auth'
import { HttpError } from './http'
import type { AuthenticatedActor, Env } from './types'

interface SessionShape {
  session: {
    activeOrganizationId?: string | null
  }
  user: {
    id: string
    name: string
    email: string
  }
}

interface MemberRow {
  id: string
  organizationId: string
  role: string
}

interface BearerActorRow extends MemberRow {
  userId: string
  name: string
  email: string
  expiresAt: string
}

function bearerSessionToken(request: Request): string | null {
  const authorization = request.headers.get('authorization')
  if (!authorization?.toLowerCase().startsWith('bearer ')) return null
  const encoded = authorization.slice(7).trim()
  if (!encoded) return null
  try {
    return decodeURIComponent(encoded).split('.')[0] || null
  } catch {
    return encoded.split('.')[0] || null
  }
}

async function authenticateBearerUser(
  request: Request,
  env: Env,
): Promise<AuthenticatedActor | null> {
  const token = bearerSessionToken(request)
  if (!token) return null
  const requestedOrganization =
    request.headers.get('x-otterdrive-organization') ??
    request.headers.get('x-otterware-organization')
  const statement = requestedOrganization
    ? env.DB.prepare(
        `SELECT u.id AS userId, u.name, u.email, s.expiresAt,
                m.id, m.organizationId, m.role
           FROM session s
           JOIN user u ON u.id = s.userId
           JOIN member m ON m.userId = u.id AND m.organizationId = ?
          WHERE s.token = ? AND coalesce(u.banned, 0) = 0
          LIMIT 1`,
      ).bind(requestedOrganization, token)
    : env.DB.prepare(
        `SELECT u.id AS userId, u.name, u.email, s.expiresAt,
                m.id, m.organizationId, m.role
           FROM session s
           JOIN user u ON u.id = s.userId
           JOIN member m ON m.userId = u.id
          WHERE s.token = ? AND coalesce(u.banned, 0) = 0
          ORDER BY CASE WHEN m.organizationId = s.activeOrganizationId THEN 0 ELSE 1 END,
                   m.createdAt
          LIMIT 1`,
      ).bind(token)
  const row = await statement.first<BearerActorRow>()
  if (!row || new Date(row.expiresAt).getTime() <= Date.now()) return null
  return {
    type: 'user',
    id: row.userId,
    name: row.name || row.email,
    userId: row.userId,
    organizationId: row.organizationId,
    roles: row.role.split(',').map((role) => role.trim()),
    permissions: {},
  }
}

export async function authenticate(
  request: Request,
  env: Env,
  auth: OtterDriveAuth,
): Promise<AuthenticatedActor> {
  const apiKeyValue = request.headers.get('x-api-key')
  if (apiKeyValue) {
    const result = await auth.api.verifyApiKey({
      body: { key: apiKeyValue, configId: 'organization' },
    })
    if (!result.valid || !result.key) {
      throw new HttpError(401, 'invalid_api_key', 'The API key is invalid.')
    }
    return {
      type: 'api_key',
      id: result.key.id,
      name: result.key.name ?? result.key.start ?? 'API key',
      userId: null,
      organizationId: result.key.referenceId,
      roles: ['api_key'],
      permissions: result.key.permissions ?? {},
    }
  }

  const bearerActor = await authenticateBearerUser(request, env)
  if (bearerActor) return bearerActor

  const session = (await auth.api.getSession({
    headers: request.headers,
  })) as SessionShape | null
  if (!session) {
    throw new HttpError(401, 'unauthenticated', 'Please log in to Otter Drive.')
  }

  const requestedOrganization =
    request.headers.get('x-otterdrive-organization') ??
    request.headers.get('x-otterware-organization')
  const organizationId =
    requestedOrganization ?? session.session.activeOrganizationId ?? null
  const member = organizationId
    ? await env.DB.prepare(
        'SELECT id, organizationId, role FROM member WHERE userId = ? AND organizationId = ?',
      )
        .bind(session.user.id, organizationId)
        .first<MemberRow>()
    : await env.DB.prepare(
        'SELECT id, organizationId, role FROM member WHERE userId = ? ORDER BY createdAt LIMIT 1',
      )
        .bind(session.user.id)
        .first<MemberRow>()

  if (!member) {
    throw new HttpError(
      403,
      'organization_required',
      'Select or create an organization before managing documents.',
    )
  }

  return {
    type: 'user',
    id: session.user.id,
    name: session.user.name || session.user.email,
    userId: session.user.id,
    organizationId: member.organizationId,
    roles: member.role.split(',').map((role: string) => role.trim()),
    permissions: {},
  }
}

export function assertCanWrite(
  actor: AuthenticatedActor,
  action: 'create' | 'update' | 'archive' = 'update',
): void {
  if (
    actor.type === 'api_key' &&
    !actor.permissions.artifact?.includes(action)
  ) {
    throw new HttpError(
      403,
      'forbidden',
      `This API key does not have artifact:${action} permission.`,
    )
  }
  if (
    actor.type === 'user' &&
    !actor.roles.some((role) => ['owner', 'admin', 'editor'].includes(role))
  ) {
    throw new HttpError(
      403,
      'forbidden',
      'Your organization role cannot modify documents.',
    )
  }
}

export function canReadWithKey(actor: AuthenticatedActor): boolean {
  return (
    actor.type !== 'api_key' ||
    actor.permissions.artifact?.includes('read') === true
  )
}

export function assertCanManageKeys(actor: AuthenticatedActor): void {
  if (
    actor.type !== 'user' ||
    !actor.roles.some((role) => ['owner', 'admin'].includes(role))
  ) {
    throw new HttpError(
      403,
      'forbidden',
      'Only organization owners and admins can manage API keys.',
    )
  }
}

export function assertCanPermanentlyDelete(actor: AuthenticatedActor): void {
  if (actor.type !== 'user' || !actor.roles.includes('owner')) {
    throw new HttpError(
      403,
      'forbidden',
      'Only the workspace owner can permanently delete documents.',
    )
  }
}
