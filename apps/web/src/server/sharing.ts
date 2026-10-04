import {
  acceptLinkResponseSchema,
  createSharesInputSchema,
  peopleResponseSchema,
  shareLinkInputSchema,
  sharedWithMeResponseSchema,
  sharingResponseSchema,
  updateShareInputSchema,
  type AccessEntry,
  type Person,
  type SharedItem,
  type ShareRole,
  type Sharing,
} from '@otterware/contracts'
import { waitUntil } from 'cloudflare:workers'
import { artifactAccess, roleRank, strongerRole } from './access'
import { canReadWithKey } from './actor'
import {
  CURRENT_VERSION_COLUMNS,
  artifactRow,
  folderSlug,
  joinedCurrentVersion,
  mapArtifactRecord,
  thumbnailUrl,
  type ArtifactListRow,
  type ArtifactRow,
} from './artifacts'
import { sendShareEmail } from './email'
import {
  folderAccess,
  folderAccessOrNull,
  mapFolder,
  type AccessRole,
  type FolderRow,
} from './folders'
import { HttpError, json, parseJson } from './http'
import type { AuthenticatedActor, Env } from './types'

/**
 * Sharing, as in Google Drive. A folder (with everything inside it) or a
 * single document is shared with people by email, as a viewer or an editor,
 * or with anyone who opens its link. Owners and editors share; anyone with
 * access sees who else has it. A shared drive itself is shared by managing
 * its members, which only its owner does. Your personal drive itself is
 * never shared, only what is in it.
 */

type Target =
  | { type: 'folder'; folder: FolderRow; role: AccessRole }
  | { type: 'artifact'; artifact: ArtifactRow; role: AccessRole }

interface UserRow {
  id: string
  email: string
  name: string | null
  image: string | null
}

interface PersonRow {
  user_id: string | null
  email: string
  name: string | null
  image: string | null
}

interface ShareRow extends PersonRow {
  id: string
  role: ShareRole
  link_id: string | null
  folder_id: string | null
}

function person(row: PersonRow): Person {
  return {
    userId: row.user_id,
    email: row.email,
    name: row.name,
    image: row.image,
  }
}

function userPerson(row: UserRow): Person {
  return {
    userId: row.id,
    email: row.email,
    name: row.name,
    image: row.image,
  }
}

function folderName(folder: FolderRow): string {
  return folder.kind === 'personal' ? 'My Drive' : folder.name
}

function resourceColumn(target: Target): 'folder_id' | 'artifact_id' {
  return target.type === 'folder' ? 'folder_id' : 'artifact_id'
}

function resourceId(target: Target): string {
  return target.type === 'folder' ? target.folder.id : target.artifact.id
}

function isDrive(target: Target): boolean {
  return target.type === 'folder' && target.folder.parent_id === null
}

async function loadFolderTarget(
  env: Env,
  actor: AuthenticatedActor,
  id: string,
): Promise<Target> {
  const access = await folderAccess(env, actor.userId!, id, actor.keyScopeId)
  const folder = await env.DB.prepare('SELECT * FROM folder WHERE id = ?')
    .bind(id)
    .first<FolderRow>()
  if (!folder) throw new HttpError(404, 'folder_not_found', 'Folder not found.')
  return { type: 'folder', folder, role: access.role }
}

async function loadArtifactTarget(
  env: Env,
  actor: AuthenticatedActor,
  reference: string,
): Promise<Target> {
  const artifact = await artifactRow(env, actor, reference)
  return { type: 'artifact', artifact, role: artifact.role }
}

/** A folder and the folders above it, nearest first; the drive is last. */
async function folderChain(env: Env, folderId: string): Promise<FolderRow[]> {
  const result = await env.DB.prepare(
    `WITH RECURSIVE chain(depth, id) AS (
       SELECT 0, ?
       UNION ALL SELECT c.depth + 1, f.parent_id
         FROM chain c JOIN folder f ON f.id = c.id
        WHERE f.parent_id IS NOT NULL
     ) SELECT f.* FROM chain c JOIN folder f ON f.id = c.id ORDER BY c.depth`,
  )
    .bind(folderId)
    .all<FolderRow>()
  if (!result.results.length)
    throw new HttpError(404, 'folder_not_found', 'Folder not found.')
  return result.results
}

function placeholders(values: unknown[]): string {
  return values.map(() => '?').join(', ')
}

async function describe(
  env: Env,
  actor: AuthenticatedActor,
  target: Target,
): Promise<Sharing> {
  const chain = await folderChain(
    env,
    target.type === 'folder' ? target.folder.id : target.artifact.folder_id,
  )
  const drive = chain.at(-1)!
  // A folder inherits sharing from the folders above it; a document from
  // its folder and every one above that. A folder-scoped API key sees
  // nothing above its folder.
  const scope = actor.keyScopeId
    ? chain.findIndex((folder) => folder.id === actor.keyScopeId)
    : chain.length - 1
  const above = (target.type === 'folder' ? chain.slice(1) : chain).slice(
    0,
    Math.max(scope + (target.type === 'folder' ? 0 : 1), 0),
  )
  const [owner, members, ownShares] = await Promise.all([
    env.DB.prepare('SELECT id, email, name, image FROM user WHERE id = ?')
      .bind(drive.owner_user_id)
      .first<UserRow>(),
    env.DB.prepare(
      `SELECT m.id, m.email, m.role, m.user_id, NULL AS link_id,
              NULL AS folder_id, u.name, u.image
         FROM drive_member m LEFT JOIN user u ON u.id = m.user_id
        WHERE m.drive_id = ?
        ORDER BY lower(coalesce(u.name, m.email))`,
    )
      .bind(drive.id)
      .all<ShareRow>(),
    env.DB.prepare(
      `SELECT folder_id FROM share
        WHERE user_id = ? AND folder_id IN (${placeholders(chain)})`,
    )
      .bind(actor.userId, ...chain.map((folder) => folder.id))
      .all<{ folder_id: string }>(),
  ])
  if (!owner) throw new HttpError(404, 'folder_not_found', 'Folder not found.')
  // Names of folders and drives you can't open stay hidden: you see a
  // folder if you own or belong to its drive, or it (or one above it) was
  // shared with you.
  const member =
    drive.owner_user_id === actor.userId ||
    members.results.some((row) => row.user_id === actor.userId)
  const sharedFrom = Math.max(
    -1,
    ...ownShares.results.map((row) =>
      chain.findIndex((folder) => folder.id === row.folder_id),
    ),
  )
  const visibleName = (folder: FolderRow) =>
    member || chain.indexOf(folder) <= sharedFrom ? folderName(folder) : null

  let people: AccessEntry[]
  if (isDrive(target)) {
    people = members.results.map((row) => ({
      ...person(row),
      id: row.id,
      role: row.role,
      inheritedFrom: null,
      viaLink: false,
    }))
  } else {
    const [direct, inherited] = await Promise.all([
      env.DB.prepare(
        `SELECT s.id, s.email, s.role, s.user_id, s.link_id, s.folder_id,
                u.name, u.image
           FROM share s LEFT JOIN user u ON u.id = s.user_id
          WHERE s.${resourceColumn(target)} = ?
          ORDER BY s.created_at, s.email`,
      )
        .bind(resourceId(target))
        .all<ShareRow>(),
      above.length
        ? env.DB.prepare(
            `SELECT s.id, s.email, s.role, s.user_id, s.link_id, s.folder_id,
                    u.name, u.image
               FROM share s LEFT JOIN user u ON u.id = s.user_id
              WHERE s.folder_id IN (${placeholders(above)})
              ORDER BY s.created_at, s.email`,
          )
            .bind(...above.map((folder) => folder.id))
            .all<ShareRow>()
        : Promise.resolve({ results: [] as ShareRow[] }),
    ])
    const listed = new Set(direct.results.map((row) => row.email))
    const nearest = (folderId: string | null) =>
      above.findIndex((folder) => folder.id === folderId)
    people = [
      ...direct.results.map((row) => ({
        ...person(row),
        id: row.id,
        role: row.role,
        inheritedFrom: null,
        viaLink: row.link_id !== null,
      })),
      // One row per person: the folder nearest to it that shares with them.
      ...inherited.results
        .filter((row) => !listed.has(row.email))
        .sort(
          (left, right) => nearest(left.folder_id) - nearest(right.folder_id),
        )
        .filter((row, index, rows) => {
          return rows.findIndex((other) => other.email === row.email) === index
        })
        .map((row) => {
          const from = above[nearest(row.folder_id)]!
          return {
            ...person(row),
            id: row.id,
            role: row.role,
            inheritedFrom: {
              id: from.id,
              name: visibleName(from) ?? 'a folder above',
            },
            viaLink: row.link_id !== null,
          }
        }),
    ]
  }

  const links = await env.DB.prepare(
    `SELECT folder_id, artifact_id, token, role FROM share_link
      WHERE ${resourceColumn(target)} = ?${
        above.length ? ` OR folder_id IN (${placeholders(above)})` : ''
      }`,
  )
    .bind(resourceId(target), ...above.map((folder) => folder.id))
    .all<{
      folder_id: string | null
      artifact_id: string | null
      token: string
      role: ShareRole
    }>()
  const own = links.results.find((link) =>
    target.type === 'folder'
      ? link.folder_id === target.folder.id
      : link.artifact_id === target.artifact.id,
  )
  const inheritedLink = above
    .map((folder) => ({
      folder,
      link: links.results.find((link) => link.folder_id === folder.id),
    }))
    .find((entry) => entry.link)

  const sharer = canShare(actor, target, drive)
  return {
    resource: {
      type: target.type,
      id: resourceId(target),
      name:
        target.type === 'folder'
          ? folderName(target.folder)
          : target.artifact.title,
      folderKind: target.type === 'folder' ? target.folder.kind : null,
    },
    drive: {
      id: drive.id,
      name:
        visibleName(drive) ??
        (drive.kind === 'shared'
          ? 'its shared drive'
          : `${owner.name || owner.email}’s drive`),
      kind: drive.kind === 'shared' ? 'shared' : 'personal',
      memberCount: drive.kind === 'shared' ? members.results.length + 1 : 1,
    },
    owner: userPerson(owner),
    role: target.role,
    canShare: sharer,
    // People who opened a link are listed to those who share it, not to one
    // another.
    people: sharer
      ? people
      : people.filter(
          (entry) => !entry.viaLink || entry.userId === actor.userId,
        ),
    link:
      own && !isDrive(target)
        ? {
            url: new URL(`/s/${own.token}`, env.APP_URL).toString(),
            role: own.role,
          }
        : null,
    inheritedLink: inheritedLink?.link
      ? {
          folderId: inheritedLink.folder.id,
          folderName: visibleName(inheritedLink.folder) ?? 'a folder above',
          role: inheritedLink.link.role,
        }
      : null,
  }
}

function canShare(
  actor: AuthenticatedActor,
  target: Target,
  drive: FolderRow,
): boolean {
  if (actor.type !== 'user') return false
  if (isDrive(target)) return drive.kind === 'shared' && target.role === 'owner'
  return roleRank(target.role) >= roleRank('editor')
}

function assertCanShare(
  actor: AuthenticatedActor,
  target: Target,
  drive: FolderRow,
) {
  if (canShare(actor, target, drive)) return
  if (isDrive(target) && drive.kind === 'personal')
    throw new HttpError(
      400,
      'personal_drive',
      'Your personal drive is private. Share its folders and documents instead.',
    )
  throw new HttpError(
    403,
    'forbidden',
    isDrive(target)
      ? 'Only the shared drive owner can manage its members.'
      : 'You need edit access to share this.',
  )
}

async function audit(
  env: Env,
  actor: AuthenticatedActor,
  target: Target,
  driveId: string,
  action: string,
  metadata: unknown,
) {
  await env.DB.prepare(
    `INSERT INTO audit_event
      (id, folder_id, actor_type, actor_id, actor_name, action, resource_type, resource_id, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      target.type === 'folder' ? target.folder.id : target.artifact.folder_id,
      actor.type,
      actor.id,
      actor.name,
      action,
      target.type,
      resourceId(target),
      JSON.stringify({ driveId, ...(metadata as object) }),
      new Date().toISOString(),
    )
    .run()
}

/** Where the resource opens in Drive. */
async function resourceUrl(env: Env, target: Target): Promise<string> {
  if (target.type === 'folder')
    return new URL(
      `/home?folder=${encodeURIComponent(target.folder.id)}`,
      env.APP_URL,
    ).toString()
  return new URL(
    `/${await folderSlug(env, target.artifact.folder_id)}/a/${target.artifact.slug}`,
    env.APP_URL,
  ).toString()
}

/** Share emails one person may send in a day. */
const DAILY_SHARE_EMAILS = 50

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18))
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

async function respond(
  env: Env,
  actor: AuthenticatedActor,
  target: Target,
  extra: { notified?: boolean } = {},
) {
  return json(
    sharingResponseSchema.parse({
      data: await describe(env, actor, target),
      ...extra,
    }),
  )
}

async function addPeople(
  request: Request,
  env: Env,
  actor: AuthenticatedActor,
  target: Target,
  drive: FolderRow,
) {
  assertCanShare(actor, target, drive)
  const input = createSharesInputSchema.parse(await parseJson(request))
  const emails = [...new Set(input.emails.map((email) => email.toLowerCase()))]
  const owner = await env.DB.prepare('SELECT email FROM user WHERE id = ?')
    .bind(drive.owner_user_id)
    .first<{ email: string }>()
  const ownerEmail = owner?.email.toLowerCase()
  if (ownerEmail && emails.includes(ownerEmail))
    throw new HttpError(400, 'owner', `${ownerEmail} owns this already.`)
  const self = await env.DB.prepare('SELECT email FROM user WHERE id = ?')
    .bind(actor.userId)
    .first<{ email: string }>()
  // Access through a link stays tied to the link: you can't make it yours.
  if (self && emails.includes(self.email.toLowerCase()))
    throw new HttpError(400, 'self', 'You can’t add yourself.')
  const users = await env.DB.prepare(
    `SELECT id, lower(email) AS email FROM user
      WHERE lower(email) IN (${placeholders(emails)}) AND emailVerified = 1`,
  )
    .bind(...emails)
    .all<{ id: string; email: string }>()
  const userIds = new Map(users.results.map((user) => [user.email, user.id]))
  const now = new Date().toISOString()
  const statements = emails.map((email) => {
    if (isDrive(target))
      return env.DB.prepare(
        `INSERT INTO drive_member(id,drive_id,email,user_id,role,created_at)
         VALUES(?,?,?,?,?,?)
         ON CONFLICT(drive_id,email) DO UPDATE SET role=excluded.role`,
      ).bind(
        crypto.randomUUID(),
        drive.id,
        email,
        userIds.get(email) ?? null,
        input.role,
        now,
      )
    const column = resourceColumn(target)
    // Adding someone by name makes their access explicit, even if they had
    // opened the link before.
    return env.DB.prepare(
      `INSERT INTO share
         (id, folder_id, artifact_id, email, user_id, role, link_id,
          created_by_user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
       ON CONFLICT(${column}, email) WHERE ${column} IS NOT NULL
       DO UPDATE SET role = excluded.role, link_id = NULL,
         user_id = coalesce(share.user_id, excluded.user_id),
         updated_at = excluded.updated_at`,
    ).bind(
      crypto.randomUUID(),
      target.type === 'folder' ? target.folder.id : null,
      target.type === 'artifact' ? target.artifact.id : null,
      email,
      userIds.get(email) ?? null,
      input.role,
      actor.userId,
      now,
      now,
    )
  })
  await env.DB.batch(statements)
  // Emails go out under our sender, so each person may send a limited number
  // a day; past it, sharing still works and the dialog offers the link.
  const sent = await env.DB.prepare(
    `SELECT coalesce(sum(json_extract(metadata_json, '$.notified')), 0) AS count
       FROM audit_event
      WHERE actor_id = ? AND action = 'share.added' AND created_at > ?`,
  )
    .bind(actor.id, new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString())
    .first<{ count: number }>()
  const notified = Boolean(
    input.notify &&
    env.RESEND_API_KEY &&
    env.EMAIL_FROM &&
    (sent?.count ?? 0) + emails.length <= DAILY_SHARE_EMAILS,
  )
  await audit(env, actor, target, drive.id, 'share.added', {
    emails,
    role: input.role,
    notified: notified ? emails.length : 0,
  })

  if (notified) {
    const [sharer, url] = await Promise.all([
      Promise.resolve(self),
      resourceUrl(env, target),
    ])
    const name =
      target.type === 'folder'
        ? folderName(target.folder)
        : target.artifact.title
    for (const email of emails)
      waitUntil(
        sendShareEmail(env, {
          recipient: email,
          sharerName: actor.name,
          sharerEmail: sharer?.email ?? null,
          title: name,
          kind: isDrive(target)
            ? 'shared drive'
            : target.type === 'folder'
              ? 'folder'
              : 'document',
          role: input.role,
          url,
          message: input.message ?? null,
        }).catch((error: unknown) => {
          console.error('Could not send a sharing email.', error)
        }),
      )
  }
  return respond(env, actor, target, { notified })
}

async function changePerson(
  request: Request,
  env: Env,
  actor: AuthenticatedActor,
  target: Target,
  drive: FolderRow,
  entryId: string,
) {
  if (request.method === 'DELETE') {
    // Anyone can remove themselves from something shared with them.
    const self = isDrive(target)
      ? null
      : await env.DB.prepare(
          `SELECT id FROM share WHERE id = ? AND ${resourceColumn(target)} = ?
             AND user_id = ?`,
        )
          .bind(entryId, resourceId(target), actor.userId)
          .first()
    if (!self || actor.type !== 'user') assertCanShare(actor, target, drive)
    const removed = isDrive(target)
      ? await env.DB.prepare(
          'DELETE FROM drive_member WHERE id = ? AND drive_id = ?',
        )
          .bind(entryId, drive.id)
          .run()
      : await env.DB.prepare(
          `DELETE FROM share WHERE id = ? AND ${resourceColumn(target)} = ?`,
        )
          .bind(entryId, resourceId(target))
          .run()
    if (!removed.meta.changes)
      throw new HttpError(
        404,
        'share_not_found',
        'That person has no access here.',
      )
    await audit(env, actor, target, drive.id, 'share.removed', { entryId })
    if (self) return new Response(null, { status: 204 })
    return respond(env, actor, target)
  }
  assertCanShare(actor, target, drive)
  const { role } = updateShareInputSchema.parse(await parseJson(request))
  const updated = isDrive(target)
    ? await env.DB.prepare(
        'UPDATE drive_member SET role = ? WHERE id = ? AND drive_id = ?',
      )
        .bind(role, entryId, drive.id)
        .run()
    : await env.DB.prepare(
        `UPDATE share SET role = ?, link_id = NULL, updated_at = ?
          WHERE id = ? AND ${resourceColumn(target)} = ?`,
      )
        .bind(role, new Date().toISOString(), entryId, resourceId(target))
        .run()
  if (!updated.meta.changes)
    throw new HttpError(
      404,
      'share_not_found',
      'That person has no access here.',
    )
  await audit(env, actor, target, drive.id, 'share.updated', { entryId, role })
  return respond(env, actor, target)
}

async function changeLink(
  request: Request,
  env: Env,
  actor: AuthenticatedActor,
  target: Target,
  drive: FolderRow,
) {
  assertCanShare(actor, target, drive)
  if (isDrive(target))
    throw new HttpError(
      400,
      'drive_link',
      'Share a drive by adding members. Links share its folders and documents.',
    )
  const column = resourceColumn(target)
  if (request.method === 'DELETE') {
    // Everyone who joined through the link loses access with it.
    await env.DB.prepare(`DELETE FROM share_link WHERE ${column} = ?`)
      .bind(resourceId(target))
      .run()
    await audit(env, actor, target, drive.id, 'link.disabled', {})
    return respond(env, actor, target)
  }
  const { role } = shareLinkInputSchema.parse(await parseJson(request))
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO share_link
         (id, folder_id, artifact_id, token, role, created_by_user_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(${column}) WHERE ${column} IS NOT NULL
       DO UPDATE SET role = excluded.role`,
    ).bind(
      crypto.randomUUID(),
      target.type === 'folder' ? target.folder.id : null,
      target.type === 'artifact' ? target.artifact.id : null,
      newToken(),
      role,
      actor.userId,
      new Date().toISOString(),
    ),
    env.DB.prepare(
      `UPDATE share SET role = ?
        WHERE link_id = (SELECT id FROM share_link WHERE ${column} = ?)`,
    ).bind(role, resourceId(target)),
  ])
  await audit(env, actor, target, drive.id, 'link.enabled', { role })
  return respond(env, actor, target)
}

async function handle(
  request: Request,
  env: Env,
  actor: AuthenticatedActor,
  target: Target,
  rest: string[],
): Promise<Response> {
  const [section, entryId] = rest
  if (!section && request.method === 'GET') {
    if (!canReadWithKey(actor))
      throw new HttpError(
        403,
        'forbidden',
        'This API key does not have artifact:read permission.',
      )
    return respond(env, actor, target)
  }
  if (actor.type !== 'user')
    throw new HttpError(403, 'forbidden', 'Sign in to share documents.')
  const chain = await folderChain(
    env,
    target.type === 'folder' ? target.folder.id : target.artifact.folder_id,
  )
  const drive = chain.at(-1)!
  if (section === 'people' && !entryId && request.method === 'POST')
    return addPeople(request, env, actor, target, drive)
  if (
    section === 'people' &&
    entryId &&
    (request.method === 'PATCH' || request.method === 'DELETE')
  )
    return changePerson(request, env, actor, target, drive, entryId)
  if (
    section === 'link' &&
    (request.method === 'PUT' || request.method === 'DELETE')
  )
    return changeLink(request, env, actor, target, drive)
  throw new HttpError(404, 'not_found', 'API endpoint not found.')
}

/** `/folders/:id/sharing[/people[/:id]|/link]` */
export async function folderSharing(
  request: Request,
  env: Env,
  actor: AuthenticatedActor,
  folderId: string,
  rest: string[],
) {
  return handle(
    request,
    env,
    actor,
    await loadFolderTarget(env, actor, folderId),
    rest,
  )
}

/** `/artifacts/:ref/sharing[/people[/:id]|/link]` */
export async function artifactSharing(
  request: Request,
  env: Env,
  actor: AuthenticatedActor,
  reference: string,
  rest: string[],
) {
  return handle(
    request,
    env,
    actor,
    await loadArtifactTarget(env, actor, reference),
    rest,
  )
}

/**
 * Opening a link (`/s/:token`) adds you to what it shares, unless you can
 * already open it with at least the link's role.
 */
export async function acceptLink(
  env: Env,
  actor: AuthenticatedActor,
  token: string,
) {
  if (actor.type !== 'user')
    throw new HttpError(403, 'forbidden', 'Sign in to open shared links.')
  const link = await env.DB.prepare('SELECT * FROM share_link WHERE token = ?')
    .bind(token)
    .first<{
      id: string
      folder_id: string | null
      artifact_id: string | null
      role: ShareRole
      created_by_user_id: string | null
    }>()
  if (!link)
    throw new HttpError(
      404,
      'link_not_found',
      'This link no longer works. Ask the owner for access.',
    )
  const user = await env.DB.prepare('SELECT email FROM user WHERE id = ?')
    .bind(actor.userId)
    .first<{ email: string }>()
  if (!user) throw new HttpError(401, 'unauthenticated', 'Please log in.')
  let target: { folderId: string; slug: string | null }
  let current: AccessRole | null
  if (link.folder_id) {
    target = { folderId: link.folder_id, slug: null }
    current =
      (await folderAccessOrNull(env, actor.userId!, link.folder_id))?.role ??
      null
  } else {
    const artifact = await env.DB.prepare(
      "SELECT * FROM artifact WHERE id = ? AND state = 'published'",
    )
      .bind(link.artifact_id)
      .first<ArtifactRow>()
    if (!artifact)
      throw new HttpError(404, 'link_not_found', 'This document was deleted.')
    target = { folderId: artifact.folder_id, slug: artifact.slug }
    current = await artifactAccess(env, { userId: actor.userId! }, artifact)
  }
  if (roleRank(current) < roleRank(link.role)) {
    const column = link.folder_id ? 'folder_id' : 'artifact_id'
    const now = new Date().toISOString()
    await env.DB.prepare(
      `INSERT INTO share
         (id, folder_id, artifact_id, email, user_id, role, link_id,
          created_by_user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(${column}, email) WHERE ${column} IS NOT NULL
       DO UPDATE SET role = excluded.role, link_id = excluded.link_id,
         user_id = excluded.user_id, updated_at = excluded.updated_at
       -- Access someone was given by name is never changed by a link, so
       -- turning the link off can't leave them with more.
       WHERE share.link_id IS NOT NULL`,
    )
      .bind(
        crypto.randomUUID(),
        link.folder_id,
        link.artifact_id,
        user.email.toLowerCase(),
        actor.userId,
        link.role,
        link.id,
        link.created_by_user_id,
        now,
        now,
      )
      .run()
  }
  return json(
    acceptLinkResponseSchema.parse({
      data: {
        type: link.folder_id ? 'folder' : 'artifact',
        folderId: target.folderId,
        folderSlug: await folderSlug(env, target.folderId),
        slug: target.slug,
      },
    }),
  )
}

/**
 * What other people shared with you directly: folders and documents outside
 * the drives you own or belong to, newest first.
 */
export async function sharedWithMe(env: Env, actor: AuthenticatedActor) {
  if (actor.keyScopeId) return json({ data: [] })
  const userId = actor.userId!
  const [memberDrives, folderShares, artifactShares] = await Promise.all([
    env.DB.prepare(
      `SELECT id FROM folder WHERE parent_id IS NULL AND owner_user_id = ?
       UNION SELECT drive_id FROM drive_member WHERE user_id = ?`,
    )
      .bind(userId, userId)
      .all<{ id: string }>(),
    env.DB.prepare(
      `SELECT f.*, s.created_at AS shared_at, f.slug AS folder_slug,
              sb.id AS sb_id, sb.email AS sb_email, sb.name AS sb_name,
              sb.image AS sb_image,
              ow.email AS ow_email, ow.name AS ow_name, ow.image AS ow_image
         FROM share s JOIN folder f ON f.id = s.folder_id
         JOIN user ow ON ow.id = f.owner_user_id
         LEFT JOIN user sb ON sb.id = s.created_by_user_id
        WHERE s.user_id = ?`,
    )
      .bind(userId)
      .all<
        FolderRow & {
          shared_at: string
          folder_slug: string
          sb_id: string | null
          sb_email: string | null
          sb_name: string | null
          sb_image: string | null
          ow_email: string
          ow_name: string | null
          ow_image: string | null
        }
      >(),
    env.DB.prepare(
      `SELECT a.*, ${CURRENT_VERSION_COLUMNS},
              s.created_at AS shared_at, f.slug AS folder_slug,
              sb.id AS sb_id, sb.email AS sb_email, sb.name AS sb_name,
              sb.image AS sb_image,
              ow.id AS ow_id, ow.email AS ow_email, ow.name AS ow_name,
              ow.image AS ow_image
         FROM share s JOIN artifact a ON a.id = s.artifact_id
         JOIN folder f ON f.id = a.folder_id
         JOIN user ow ON ow.id = a.owner_user_id
         LEFT JOIN artifact_version v ON v.id = a.current_version_id
         LEFT JOIN user sb ON sb.id = s.created_by_user_id
        WHERE s.user_id = ? AND a.state = 'published'`,
    )
      .bind(userId)
      .all<
        ArtifactListRow & {
          shared_at: string
          folder_slug: string
          sb_id: string | null
          sb_email: string | null
          sb_name: string | null
          sb_image: string | null
          ow_id: string
          ow_email: string
          ow_name: string | null
          ow_image: string | null
        }
      >(),
  ])
  const mine = new Set(memberDrives.results.map((row) => row.id))
  const sharer = (row: {
    sb_id: string | null
    sb_email: string | null
    sb_name: string | null
    sb_image: string | null
  }): Person | null =>
    row.sb_id && row.sb_email
      ? {
          userId: row.sb_id,
          email: row.sb_email,
          name: row.sb_name,
          image: row.sb_image,
        }
      : null

  const items: SharedItem[] = []
  for (const row of folderShares.results) {
    const access = await folderAccessOrNull(env, userId, row.id)
    if (!access || mine.has(access.driveId)) continue
    const shared = await env.DB.prepare(
      `SELECT EXISTS(SELECT 1 FROM share WHERE folder_id = ?)
           OR EXISTS(SELECT 1 FROM share_link WHERE folder_id = ?) AS shared`,
    )
      .bind(row.id, row.id)
      .first<{ shared: number }>()
    items.push({
      type: 'folder',
      role: access.role,
      sharedAt: row.shared_at,
      sharedBy: sharer(row),
      owner: {
        userId: row.owner_user_id,
        email: row.ow_email,
        name: row.ow_name,
        image: row.ow_image,
      },
      folderSlug: row.folder_slug,
      folder: mapFolder(row, access.role, Boolean(shared?.shared)),
    })
  }
  for (const row of artifactShares.results) {
    const viaFolder = await folderAccessOrNull(env, userId, row.folder_id)
    if (viaFolder && mine.has(viaFolder.driveId)) continue
    if (!viaFolder) {
      // Outside every folder you can open: check which drive it lives in.
      const drive = await folderChain(env, row.folder_id)
      if (mine.has(drive.at(-1)!.id)) continue
    }
    const role =
      strongerRole(
        viaFolder?.role ?? null,
        await artifactAccess(env, { userId }, row, null),
      ) ?? 'viewer'
    items.push({
      type: 'artifact',
      role,
      sharedAt: row.shared_at,
      sharedBy: sharer(row),
      owner: {
        userId: row.ow_id,
        email: row.ow_email,
        name: row.ow_name,
        image: row.ow_image,
      },
      folderSlug: row.folder_slug,
      artifact: mapArtifactRecord(
        env,
        row,
        joinedCurrentVersion(row),
        row.folder_slug,
        {
          thumbnailUrl: await thumbnailUrl(env, row),
          role,
          shared: true,
        },
      ),
    })
  }
  items.sort((left, right) => right.sharedAt.localeCompare(left.sharedAt))
  return json(sharedWithMeResponseSchema.parse({ data: items }))
}

/**
 * People to suggest in the share dialog: members of drives you share, the
 * people you have shared with, and the people who shared with you.
 */
export async function suggestPeople(
  request: Request,
  env: Env,
  actor: AuthenticatedActor,
) {
  if (actor.keyScopeId) return json({ data: [] })
  const query = (new URL(request.url).searchParams.get('q') ?? '')
    .trim()
    .toLowerCase()
  const pattern = `%${query.replaceAll(/[%_\\]/g, (match) => `\\${match}`)}%`
  const userId = actor.userId!
  const result = await env.DB.prepare(
    `WITH drives(id) AS (
       SELECT id FROM folder WHERE parent_id IS NULL AND owner_user_id = ?
       UNION SELECT drive_id FROM drive_member WHERE user_id = ?
     ), known(user_id, email) AS (
       SELECT m.user_id, m.email FROM drive_member m JOIN drives d ON d.id = m.drive_id
       UNION SELECT f.owner_user_id, NULL FROM folder f JOIN drives d ON d.id = f.id
       UNION SELECT s.user_id, s.email FROM share s WHERE s.created_by_user_id = ?
       UNION SELECT s.created_by_user_id, NULL FROM share s WHERE s.user_id = ?
     )
     SELECT DISTINCT u.id AS user_id, coalesce(u.email, k.email) AS email,
            u.name, u.image
       FROM known k LEFT JOIN user u ON u.id = k.user_id
      WHERE coalesce(u.email, k.email) IS NOT NULL
        AND (u.id IS NULL OR u.id != ?)
        AND (lower(coalesce(u.email, k.email)) LIKE ? ESCAPE '\\'
             OR lower(coalesce(u.name, '')) LIKE ? ESCAPE '\\')
      ORDER BY lower(coalesce(u.name, k.email))
      LIMIT 8`,
  )
    .bind(userId, userId, userId, userId, userId, pattern, pattern)
    .all<PersonRow>()
  return json(peopleResponseSchema.parse({ data: result.results.map(person) }))
}
