import { queryOptions } from '@tanstack/react-query'
import { artifactBootstrapResponseSchema } from '@otterware/contracts'
import type { ArtifactBootstrapResponse } from '@otterware/contracts'
import { api } from './api'
import { readSessionCache, writeSessionCache } from './session-cache'

/**
 * A document, its versions and a preview grant. `reference` is its slug in
 * `folderId`, or its id when `folderId` is undefined: a document shared with
 * you on its own, outside your folders, is opened by id.
 */
export function artifactBootstrapQuery(
  folderId: string | undefined,
  reference: string,
  version?: number,
) {
  const slug = reference
  const storageKey = `otterdrive:artifact:${folderId ?? 'shared'}:${slug}:${version ?? 'current'}`
  const stored = readSessionCache<ArtifactBootstrapResponse['data']>(
    storageKey,
    4 * 60_000,
  )
  return queryOptions({
    queryKey: [
      'artifact-bootstrap',
      folderId ?? 'shared',
      slug,
      version ?? 'current',
    ],
    queryFn: async () => {
      const query = version ? `?version=${version}` : ''
      const result = artifactBootstrapResponseSchema.parse(
        await api<unknown>(
          `/api/v1/artifacts/${encodeURIComponent(slug)}/bootstrap${query}`,
          { folderId },
        ),
      )
      return writeSessionCache(storageKey, result.data)
    },
    ...(stored
      ? { initialData: stored.value, initialDataUpdatedAt: stored.savedAt }
      : {}),
    staleTime: 4 * 60_000,
  })
}
