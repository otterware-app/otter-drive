import { env } from 'cloudflare:workers'
import { createFileRoute } from '@tanstack/react-router'
import {
  createFolder,
  listFolders,
  updateFolder,
  deleteFolder,
  driveMembers,
  transferDrive,
} from '#/server/folders'
import { authenticate } from '#/server/actor'
import {
  archiveArtifact,
  bootstrapArtifact,
  completeUpload,
  completeMultipartFile,
  createArtifact,
  createUpload,
  deleteDraft,
  downloadArtifact,
  listArtifacts,
  listFiles,
  listVersions,
  moveArtifact,
  permanentlyDeleteArtifact,
  previewArtifact,
  promoteVersion,
  regenerateThumbnail,
  readContent,
  showArtifact,
  updateArtifact,
  uploadFile,
} from '#/server/artifacts'
import { createAuth } from '#/server/auth'
import {
  acceptLink,
  artifactSharing,
  folderSharing,
  sharedWithMe,
  suggestPeople,
} from '#/server/sharing'
import { errorResponse, HttpError, json } from '#/server/http'

async function handler({ request }: { request: Request }): Promise<Response> {
  // Await here: the route functions are async, and a rejected promise that is
  // merely returned would skip this catch and reach the client unformatted.
  try {
    return await route(request)
  } catch (error) {
    return errorResponse(error)
  }
}

async function route(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const segments = url.pathname
    .slice('/api/v1/'.length)
    .split('/')
    .filter(Boolean)
    .map(decodeURIComponent)

  if (segments[0] === 'auth-config' && request.method === 'GET') {
    return json({
      data: {
        otterEnabled: true,
        googleEnabled: false,
        passwordEnabled: false,
      },
    })
  }

  if (
    !['GET', 'HEAD'].includes(request.method) &&
    request.headers.has('cookie') &&
    request.headers.get('origin') !== new URL(env.APP_URL).origin
  )
    throw new HttpError(
      403,
      'invalid_origin',
      'Use the Drive app to make this request.',
    )
  const auth = createAuth(env)
  const actor = await authenticate(request, env, auth)

  if (segments[0] === 'folders') {
    const id = segments[1]
    if (!id && request.method === 'GET') return listFolders(env, actor)
    if (!id && request.method === 'POST')
      return createFolder(request, env, actor)
    if (id && segments[2] === 'owner' && request.method === 'POST')
      return transferDrive(request, env, actor, id)
    if (id && segments[2] === 'members')
      return driveMembers(request, env, actor, id, segments[3])
    if (id && segments[2] === 'sharing')
      return folderSharing(request, env, actor, id, segments.slice(3))
    if (id && request.method === 'PATCH')
      return updateFolder(request, env, actor, id)
    if (id && request.method === 'DELETE') return deleteFolder(env, actor, id)
  }

  if (segments[0] === 'shared' && !segments[1] && request.method === 'GET')
    return sharedWithMe(env, actor)
  if (segments[0] === 'people' && !segments[1] && request.method === 'GET')
    return suggestPeople(request, env, actor)
  if (segments[0] === 'links' && segments[1] && request.method === 'POST')
    return acceptLink(env, actor, segments[1])

  if (segments[0] === 'me' && request.method === 'GET') {
    return json({
      data: {
        actor: {
          id: actor.id,
          type: actor.type,
          name: actor.name,
        },
        userId: actor.userId,
        folderId: actor.folderId,
        organizationId: actor.folderId,
        roles: actor.roles,
        permissions: actor.permissions,
      },
    })
  }

  if (segments[0] === 'artifacts') {
    const reference = segments[1]
    if (!reference) {
      if (request.method === 'GET') return listArtifacts(request, env, actor)
      if (request.method === 'POST') return createArtifact(request, env, actor)
    } else if (!segments[2]) {
      if (request.method === 'GET') return showArtifact(env, actor, reference)
      if (request.method === 'PATCH') {
        return updateArtifact(request, env, actor, reference)
      }
      if (request.method === 'DELETE') {
        return archiveArtifact(env, actor, reference)
      }
    } else if (segments[2] === 'sharing') {
      return artifactSharing(request, env, actor, reference, segments.slice(3))
    } else if (segments[2] === 'draft' && request.method === 'DELETE') {
      return deleteDraft(env, actor, reference)
    } else if (segments[2] === 'restore' && request.method === 'POST') {
      return archiveArtifact(env, actor, reference, true)
    } else if (segments[2] === 'move' && request.method === 'POST') {
      return moveArtifact(request, env, actor, reference)
    } else if (segments[2] === 'permanent' && request.method === 'DELETE') {
      return permanentlyDeleteArtifact(env, actor, reference)
    } else if (segments[2] === 'versions' && request.method === 'GET') {
      return listVersions(env, actor, reference)
    } else if (segments[2] === 'files' && request.method === 'GET') {
      return listFiles(request, env, actor, reference)
    } else if (segments[2] === 'content' && request.method === 'GET') {
      return readContent(request, env, actor, reference)
    } else if (segments[2] === 'download' && request.method === 'GET') {
      return downloadArtifact(request, env, actor, reference)
    } else if (segments[2] === 'preview' && request.method === 'GET') {
      return previewArtifact(request, env, actor, reference)
    } else if (segments[2] === 'bootstrap' && request.method === 'GET') {
      return bootstrapArtifact(request, env, actor, reference)
    } else if (segments[2] === 'thumbnail' && request.method === 'POST') {
      return regenerateThumbnail(request, env, actor, reference)
    } else if (segments[2] === 'uploads' && request.method === 'POST') {
      return createUpload(request, env, actor, reference)
    } else if (segments[2] === 'promote' && request.method === 'POST') {
      return promoteVersion(request, env, actor, reference)
    }
  }

  if (segments[0] === 'uploads' && segments[1]) {
    if (segments[2] === 'files' && segments[3] && request.method === 'PUT') {
      return uploadFile(request, env, actor, segments[1], segments[3])
    }
    if (
      segments[2] === 'files' &&
      segments[3] &&
      segments[4] === 'complete' &&
      request.method === 'POST'
    ) {
      return completeMultipartFile(
        request,
        env,
        actor,
        segments[1],
        segments[3],
      )
    }
    if (segments[2] === 'complete' && request.method === 'POST') {
      return completeUpload(env, actor, segments[1])
    }
  }

  throw new HttpError(404, 'not_found', 'API endpoint not found.')
}

export const Route = createFileRoute('/api/v1/$')({
  server: {
    handlers: {
      GET: handler,
      POST: handler,
      PUT: handler,
      PATCH: handler,
      DELETE: handler,
    },
  },
})
