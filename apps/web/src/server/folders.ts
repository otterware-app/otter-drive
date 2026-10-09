import {
  createFolderInputSchema,
  transferDriveInputSchema,
  updateFolderInputSchema,
  inviteDriveMemberInputSchema,
} from '@otterware/contracts'
import { HttpError, json, parseJson } from './http'
import type { AuthenticatedActor, Env } from './types'

export interface FolderRow {
  id: string
  name: string
  slug: string
  owner_user_id: string
  parent_id: string | null
  kind: 'personal' | 'shared' | 'folder'
  created_at: string
  updated_at: string
}
export async function ensurePersonalDrive(env: Env, userId: string) {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO folder (id,name,slug,owner_user_id,parent_id,kind,created_at,updated_at)
    VALUES (?, 'My Drive', ?, ?, NULL, 'personal', ?, ?)`,
  )
    .bind(
      `home_${userId}`,
      `home-${userId}`,
      userId,
      new Date().toISOString(),
      new Date().toISOString(),
    )
    .run()
}
export type AccessRole = 'owner' | 'editor' | 'viewer'
export interface FolderAccess {
  driveId: string
  driveKind: 'personal' | 'shared'
  ownerUserId: string
  role: AccessRole
  /** Owner or member of the drive, rather than shared into it. */
  member: boolean
}
/**
 * Your access to a folder: owning its drive, being a member of it, or the
 * folder (or one above it) being shared with you. The strongest one wins.
 */
export async function folderAccess(
  env: Env,
  userId: string,
  id: string,
  keyScope?: string | null,
): Promise<FolderAccess> {
  const row = await env.DB.prepare(
    `WITH RECURSIVE ancestors AS (
    SELECT * FROM folder WHERE id = ?
    UNION ALL SELECT f.* FROM folder f JOIN ancestors a ON f.id=a.parent_id
  ), shared AS (
    SELECT max(CASE s.role WHEN 'editor' THEN 2 ELSE 1 END) AS rank
    FROM share s JOIN ancestors x ON s.folder_id=x.id WHERE s.user_id=?
  ) SELECT root.id AS driveId, root.kind AS driveKind,
    root.owner_user_id AS ownerUserId,
    CASE WHEN root.owner_user_id=? THEN 'owner'
      WHEN m.role='editor' OR (SELECT rank FROM shared)=2 THEN 'editor'
      WHEN m.role='viewer' OR (SELECT rank FROM shared)=1 THEN 'viewer'
    END AS role,
    (root.owner_user_id=? OR m.user_id IS NOT NULL) AS member,
    (SELECT count(*) FROM ancestors WHERE id=?) AS inScope
    FROM ancestors root LEFT JOIN drive_member m ON m.drive_id=root.id AND m.user_id=?
    WHERE root.parent_id IS NULL LIMIT 1`,
  )
    .bind(id, userId, userId, userId, keyScope ?? id, userId)
    .first<{
      driveId: string
      driveKind: 'personal' | 'shared'
      ownerUserId: string
      role: AccessRole | null
      member: number
      inScope: number
    }>()
  if (!row?.role || !row.inScope)
    throw new HttpError(404, 'folder_not_found', 'Folder not found.')
  return {
    driveId: row.driveId,
    driveKind: row.driveKind,
    ownerUserId: row.ownerUserId,
    role: row.role,
    member: Boolean(row.member),
  }
}
/** `folderAccess`, or null when you have none. */
export async function folderAccessOrNull(
  env: Env,
  userId: string,
  id: string,
  keyScope?: string | null,
): Promise<FolderAccess | null> {
  try {
    return await folderAccess(env, userId, id, keyScope)
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return null
    throw error
  }
}
export function mapFolder(row: FolderRow, role: AccessRole, shared?: boolean) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    parentId: row.parent_id,
    kind: row.kind,
    ownerUserId: row.owner_user_id,
    role,
    ...(shared === undefined ? {} : { shared }),
  }
}
const ROLE_BY_RANK = ['viewer', 'viewer', 'editor', 'owner'] as const
export async function listFolders(env: Env, actor: AuthenticatedActor) {
  // Your drives and everything in them, then folders shared with you and
  // everything in those. A folder reached both ways keeps the stronger role.
  const result = await env.DB.prepare(
    `WITH RECURSIVE seeds(id, rank) AS (
    SELECT f.id, CASE WHEN f.owner_user_id=? THEN 3 WHEN m.role='editor' THEN 2 ELSE 1 END
    FROM folder f LEFT JOIN drive_member m ON m.drive_id=f.id AND m.user_id=?
    WHERE f.parent_id IS NULL AND (f.owner_user_id=? OR m.user_id IS NOT NULL)
    UNION ALL SELECT s.folder_id, CASE s.role WHEN 'editor' THEN 2 ELSE 1 END
    FROM share s WHERE s.user_id=? AND s.folder_id IS NOT NULL
  ), accessible(id, rank) AS (
    SELECT id, rank FROM seeds
    UNION ALL SELECT f.id, a.rank FROM folder f JOIN accessible a ON f.parent_id=a.id
  ) SELECT f.*, max(a.rank) AS access_rank,
    (EXISTS(SELECT 1 FROM share s WHERE s.folder_id=f.id)
      OR EXISTS(SELECT 1 FROM share_link l WHERE l.folder_id=f.id)) AS is_shared
    FROM accessible a JOIN folder f ON f.id=a.id GROUP BY f.id
    ORDER BY f.kind='personal' DESC, lower(f.name), f.id`,
  )
    .bind(actor.userId, actor.userId, actor.userId, actor.userId)
    .all<FolderRow & { access_rank: number; is_shared: number }>()
  let rows = result.results
  if (actor.keyScopeId) {
    const allowed = new Set([actor.keyScopeId])
    let changed = true
    while (changed) {
      changed = false
      for (const row of rows)
        if (
          row.parent_id &&
          allowed.has(row.parent_id) &&
          !allowed.has(row.id)
        ) {
          allowed.add(row.id)
          changed = true
        }
    }
    rows = rows.filter((row) => allowed.has(row.id))
  }
  return json({
    data: rows.map((row) =>
      mapFolder(row, ROLE_BY_RANK[row.access_rank]!, Boolean(row.is_shared)),
    ),
  })
}
export async function createFolder(
  request: Request,
  env: Env,
  actor: AuthenticatedActor,
) {
  if (actor.type !== 'user')
    throw new HttpError(
      403,
      'forbidden',
      'Sign in to create folders or shared drives.',
    )
  const input = createFolderInputSchema.parse(await parseJson(request))
  const parent = input.parentId
    ? await folderAccess(env, actor.userId!, input.parentId)
    : null
  if (parent && parent.role === 'viewer')
    throw new HttpError(
      403,
      'forbidden',
      'You need edit access to create a folder.',
    )
  if (!parent && input.kind !== 'shared')
    throw new HttpError(400, 'parent_required', 'Choose a parent folder.')
  const id = crypto.randomUUID(),
    now = new Date().toISOString()
  const slug = `${
    input.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'folder'
  }-${id.slice(0, 8)}`
  await env.DB.prepare(
    `INSERT INTO folder(id,name,slug,owner_user_id,parent_id,kind,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`,
  )
    .bind(
      id,
      input.name,
      slug,
      parent?.ownerUserId ?? actor.userId,
      input.parentId ?? null,
      parent ? 'folder' : 'shared',
      now,
      now,
    )
    .run()
  return json(
    {
      data: {
        id,
        name: input.name,
        slug,
        parentId: input.parentId ?? null,
        kind: parent ? 'folder' : 'shared',
        ownerUserId: parent?.ownerUserId ?? actor.userId,
        role: parent?.role ?? 'owner',
      },
    },
    { status: 201 },
  )
}
export async function updateFolder(
  request: Request,
  env: Env,
  actor: AuthenticatedActor,
  id: string,
) {
  const access = await folderAccess(env, actor.userId!, id, actor.keyScopeId)
  const input = updateFolderInputSchema.parse(await parseJson(request))
  const row = await env.DB.prepare('SELECT * FROM folder WHERE id=?')
    .bind(id)
    .first<FolderRow>()
  if (!row) throw new HttpError(404, 'not_found', 'Folder not found.')
  // Editors rename folders, as in Google Drive; drives and moves stay with
  // the owner.
  const renamesFolderOnly =
    row.kind === 'folder' && input.parentId === undefined
  if (
    actor.type !== 'user' ||
    (access.role !== 'owner' &&
      !(renamesFolderOnly && access.role === 'editor'))
  )
    throw new HttpError(
      403,
      'forbidden',
      'Only the drive owner can reorganize folders.',
    )
  if (row.kind === 'personal' && input.name && input.name !== row.name)
    throw new HttpError(
      400,
      'personal_drive',
      'Your personal drive is always called My Drive.',
    )
  if (input.parentId !== undefined) {
    if (row.kind !== 'folder')
      throw new HttpError(
        400,
        'drive_root',
        'A drive cannot be moved inside a folder.',
      )
    const destination = await folderAccess(env, actor.userId!, input.parentId)
    if (destination.driveId !== access.driveId)
      throw new HttpError(
        400,
        'different_drive',
        'Move folders within the same drive. Move documents individually between drives.',
      )
    const cycle = await env.DB.prepare(
      `WITH RECURSIVE subtree(id) AS (SELECT id FROM folder WHERE id=? UNION ALL SELECT f.id FROM folder f JOIN subtree s ON f.parent_id=s.id) SELECT id FROM subtree WHERE id=?`,
    )
      .bind(id, input.parentId)
      .first()
    if (cycle)
      throw new HttpError(
        400,
        'folder_cycle',
        'A folder cannot contain itself.',
      )
  }
  // Test the subtree in the same statement as the move, so concurrent moves
  // cannot create a cycle between the earlier validation and this write.
  const updated = await env.DB.prepare(
    `WITH RECURSIVE descendants(id) AS (
    SELECT id FROM folder WHERE id=? UNION ALL SELECT f.id FROM folder f JOIN descendants d ON f.parent_id=d.id
  ) UPDATE folder SET name=?,parent_id=?,updated_at=? WHERE id=?
    AND (? IS NULL OR NOT EXISTS(SELECT 1 FROM descendants WHERE id=?))`,
  )
    .bind(
      id,
      input.name ?? row.name,
      input.parentId ?? row.parent_id,
      new Date().toISOString(),
      id,
      input.parentId ?? row.parent_id,
      input.parentId ?? row.parent_id,
    )
    .run()
  if (!updated.meta.changes)
    throw new HttpError(
      409,
      'folder_cycle',
      'The destination changed. A folder cannot contain itself.',
    )
  return json({
    data: mapFolder(
      {
        ...row,
        name: input.name ?? row.name,
        parent_id: input.parentId ?? row.parent_id,
      },
      access.role,
    ),
  })
}
export async function deleteFolder(
  env: Env,
  actor: AuthenticatedActor,
  id: string,
) {
  const access = await folderAccess(env, actor.userId!, id)
  if (actor.type !== 'user' || access.role !== 'owner')
    throw new HttpError(
      403,
      'forbidden',
      'Only the drive owner can delete folders.',
    )
  // A drive's storage goes with it, unless documents moved to other drives
  // are still stored there.
  const storage = await env.DB.prepare(
    `SELECT count(*) AS backends,
       (SELECT count(*) FROM artifact_file f JOIN storage_backend b ON b.id=f.storage_backend_id WHERE b.drive_id=?1)
       + (SELECT count(*) FROM artifact_version v JOIN storage_backend b ON b.id=v.preview_storage_backend_id WHERE b.drive_id=?1)
       AS held
     FROM storage_backend WHERE drive_id=?1`,
  )
    .bind(id)
    .first<{ backends: number; held: number }>()
  if (storage?.held)
    throw new HttpError(
      409,
      'storage_in_use',
      'Documents moved out of this drive are still stored in its storage. Delete them first.',
    )
  const empty = `id=?1 AND kind!='personal'
    AND NOT EXISTS(SELECT 1 FROM folder child WHERE child.parent_id=folder.id)
    AND NOT EXISTS(SELECT 1 FROM artifact a WHERE a.folder_id=folder.id)`
  const [, , result] = await env.DB.batch([
    env.DB.prepare(
      `UPDATE folder SET storage_backend_id=NULL WHERE ${empty}`,
    ).bind(id),
    env.DB.prepare(
      `DELETE FROM storage_backend WHERE drive_id=?1
       AND EXISTS(SELECT 1 FROM folder WHERE ${empty})`,
    ).bind(id),
    env.DB.prepare(`DELETE FROM folder WHERE ${empty}`).bind(id),
  ])
  if (!result?.meta.changes)
    throw new HttpError(
      409,
      'folder_not_empty',
      'Only empty folders and shared drives can be deleted. Your personal drive cannot be deleted here.',
    )
  return new Response(null, { status: 204 })
}
export async function driveMembers(
  request: Request,
  env: Env,
  actor: AuthenticatedActor,
  id: string,
  memberId?: string,
) {
  const access = await folderAccess(env, actor.userId!, id)
  const root = await env.DB.prepare(
    "SELECT id FROM folder WHERE id=? AND kind='shared'",
  )
    .bind(id)
    .first()
  if (!root || actor.type !== 'user' || access.role !== 'owner')
    throw new HttpError(
      403,
      'forbidden',
      'Only the shared drive owner can manage access.',
    )
  if (request.method === 'GET') {
    const rows = await env.DB.prepare(
      'SELECT id,email,role,user_id AS userId FROM drive_member WHERE drive_id=? ORDER BY email',
    )
      .bind(id)
      .all()
    return json({ data: rows.results })
  }
  if (request.method === 'DELETE' && memberId) {
    await env.DB.prepare('DELETE FROM drive_member WHERE id=? AND drive_id=?')
      .bind(memberId, id)
      .run()
    return new Response(null, { status: 204 })
  }
  const input = inviteDriveMemberInputSchema.parse(await parseJson(request))
  const email = input.email.toLowerCase()
  const user = await env.DB.prepare(
    'SELECT id FROM user WHERE lower(email)=? AND emailVerified=1',
  )
    .bind(email)
    .first<{ id: string }>()
  if (user?.id === access.ownerUserId)
    throw new HttpError(400, 'owner', 'This person already owns the drive.')
  await env.DB.prepare(
    `INSERT INTO drive_member(id,drive_id,email,user_id,role,created_at) VALUES(?,?,?,?,?,?)
    ON CONFLICT(drive_id,email) DO UPDATE SET role=excluded.role`,
  )
    .bind(
      crypto.randomUUID(),
      id,
      email,
      user?.id ?? null,
      input.role,
      new Date().toISOString(),
    )
    .run()
  return json({ data: { email, role: input.role } })
}

export async function transferDrive(
  request: Request,
  env: Env,
  actor: AuthenticatedActor,
  id: string,
) {
  const access = await folderAccess(env, actor.userId!, id)
  const root = await env.DB.prepare(
    "SELECT * FROM folder WHERE id=? AND kind='shared'",
  )
    .bind(id)
    .first<FolderRow>()
  if (!root || actor.type !== 'user' || access.role !== 'owner')
    throw new HttpError(
      403,
      'forbidden',
      'Only the shared drive owner can transfer ownership.',
    )
  const { userId } = transferDriveInputSchema.parse(await parseJson(request))
  const member = await env.DB.prepare(
    'SELECT user_id FROM drive_member WHERE drive_id=? AND user_id=?',
  )
    .bind(id, userId)
    .first()
  if (!member || userId === actor.userId)
    throw new HttpError(
      400,
      'invalid_owner',
      'Choose a collaborator who has signed in.',
    )
  const subtree = `WITH RECURSIVE tree(id) AS (SELECT id FROM folder WHERE id=? UNION ALL SELECT f.id FROM folder f JOIN tree t ON f.parent_id=t.id)`
  await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO drive_member(id,drive_id,email,user_id,role,created_at) SELECT ?,?,lower(email),id,'editor',? FROM user WHERE id=?`,
    ).bind(crypto.randomUUID(), id, new Date().toISOString(), actor.userId),
    env.DB.prepare(
      `${subtree} UPDATE folder SET owner_user_id=? WHERE id IN (SELECT id FROM tree)`,
    ).bind(id, userId),
    env.DB.prepare(
      `${subtree} UPDATE artifact SET owner_user_id=? WHERE folder_id IN (SELECT id FROM tree)`,
    ).bind(id, userId),
    env.DB.prepare(
      'DELETE FROM drive_member WHERE drive_id=? AND user_id=?',
    ).bind(id, userId),
  ])
  return new Response(null, { status: 204 })
}
