import type { OtterDriveAuth } from './auth'
import { ensurePersonalDrive, folderAccess } from './folders'
import { HttpError } from './http'
import type { AuthenticatedActor, Env } from './types'

export async function authenticate(
  request: Request,
  env: Env,
  auth: OtterDriveAuth,
): Promise<AuthenticatedActor> {
  let actor: Omit<AuthenticatedActor, 'folderId' | 'roles' | 'ownerUserId'>
  const key = request.headers.get('x-api-key')
  if (key) {
    const result = await auth.api.verifyApiKey({
      body: { key, configId: 'user' },
    })
    if (!result.valid || !result.key)
      throw new HttpError(401, 'invalid_api_key', 'The API key is invalid.')
    const user = await env.DB.prepare(
      'SELECT id FROM user WHERE id=? AND coalesce(banned,0)=0',
    )
      .bind(result.key.referenceId)
      .first()
    if (!user)
      throw new HttpError(401, 'invalid_api_key', 'The API key is invalid.')
    const metadata = result.key.metadata as { folderId?: string } | null
    actor = {
      type: 'api_key',
      id: result.key.id,
      name: result.key.name ?? 'API key',
      userId: result.key.referenceId,
      permissions: result.key.permissions ?? {},
      keyScopeId: metadata?.folderId ?? null,
    }
  } else {
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session)
      throw new HttpError(
        401,
        'unauthenticated',
        'Please log in to Otter Drive.',
      )
    actor = {
      type: 'user',
      id: session.user.id,
      name: session.user.name || session.user.email,
      userId: session.user.id,
      permissions: {},
      keyScopeId: null,
    }
  }
  await ensurePersonalDrive(env, actor.userId!)
  let folderId =
    request.headers.get('x-otterdrive-folder') ??
    request.headers.get('x-otterdrive-organization') ??
    request.headers.get('x-otterware-organization') ??
    actor.keyScopeId
  if (!folderId) {
    const personal = await env.DB.prepare(
      "SELECT id FROM folder WHERE owner_user_id=? AND kind='personal'",
    )
      .bind(actor.userId)
      .first<{ id: string }>()
    folderId = personal!.id
  }
  const access = await folderAccess(
    env,
    actor.userId!,
    folderId,
    actor.keyScopeId,
  )
  return {
    ...actor,
    folderId,
    roles: [access.role],
    ownerUserId: access.ownerUserId,
  }
}
export function assertCanWrite(
  actor: AuthenticatedActor,
  action: 'create' | 'update' | 'archive' = 'update',
): void {
  if (actor.type === 'api_key' && !actor.permissions.artifact?.includes(action))
    throw new HttpError(
      403,
      'forbidden',
      `This API key does not have artifact:${action} permission.`,
    )
  if (!actor.roles.some((role) => ['owner', 'editor'].includes(role)))
    throw new HttpError(
      403,
      'forbidden',
      'You need edit access to modify documents.',
    )
}
export function canReadWithKey(actor: AuthenticatedActor): boolean {
  return (
    actor.type !== 'api_key' ||
    actor.permissions.artifact?.includes('read') === true
  )
}
export function assertCanManageKeys(actor: AuthenticatedActor): void {
  if (actor.type !== 'user')
    throw new HttpError(403, 'forbidden', 'Sign in to manage your API keys.')
}
export function assertCanPermanentlyDelete(actor: AuthenticatedActor): void {
  if (actor.type !== 'user' || !actor.roles.includes('owner'))
    throw new HttpError(
      403,
      'forbidden',
      'Only the drive owner can permanently delete documents.',
    )
}
