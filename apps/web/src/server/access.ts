import { folderAccessOrNull, type AccessRole } from './folders'
import type { Env } from './types'

/**
 * Access to documents. A folder's access comes from its drive (owning it or
 * being a member) or from sharing on the folder or one above it; see
 * `folderAccess`. A document adds its own sharing on top.
 */

const RANK: Record<AccessRole, number> = { viewer: 1, editor: 2, owner: 3 }

export function roleRank(role: AccessRole | null | undefined): number {
  return role ? RANK[role] : 0
}

/** The stronger of two roles; null is no access. */
export function strongerRole(
  left: AccessRole | null,
  right: AccessRole | null,
): AccessRole | null {
  return roleRank(right) > roleRank(left) ? right : left
}

/** The role a document's own sharing gives you. */
export async function artifactShareRole(
  env: Env,
  userId: string,
  artifactId: string,
): Promise<'editor' | 'viewer' | null> {
  const row = await env.DB.prepare(
    `SELECT max(CASE role WHEN 'editor' THEN 2 ELSE 1 END) AS rank
       FROM share WHERE artifact_id = ? AND user_id = ?`,
  )
    .bind(artifactId, userId)
    .first<{ rank: number | null }>()
  return row?.rank === 2 ? 'editor' : row?.rank === 1 ? 'viewer' : null
}

/**
 * Your access to a document: through its folder, or the document being
 * shared with you, whichever is stronger. Pass `folderRole` when it is
 * already known. API keys scoped to a folder only reach documents inside it.
 */
export async function artifactAccess(
  env: Env,
  principal: { userId: string; keyScopeId?: string | null | undefined },
  artifact: { id: string; folder_id: string },
  folderRole?: AccessRole | null,
): Promise<AccessRole | null> {
  const viaFolder =
    folderRole !== undefined
      ? folderRole
      : ((
          await folderAccessOrNull(
            env,
            principal.userId,
            artifact.folder_id,
            principal.keyScopeId,
          )
        )?.role ?? null)
  if (principal.keyScopeId) return viaFolder
  return strongerRole(
    viaFolder,
    await artifactShareRole(env, principal.userId, artifact.id),
  )
}
