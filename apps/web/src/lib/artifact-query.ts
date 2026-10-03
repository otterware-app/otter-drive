import { queryOptions } from '@tanstack/react-query'
import { artifactBootstrapResponseSchema } from '@otterware/contracts'
import type { ArtifactBootstrapResponse } from '@otterware/contracts'
import { api } from './api'
import { readSessionCache, writeSessionCache } from './session-cache'

export function artifactBootstrapQuery(
  folderId: string,
  slug: string,
  version?: number,
) {
  const storageKey = `otterdrive:artifact:${folderId}:${slug}:${version ?? 'current'}`
  const stored = readSessionCache<ArtifactBootstrapResponse['data']>(
    storageKey,
    4 * 60_000,
  )
  return queryOptions({
    queryKey: ['artifact-bootstrap', folderId, slug, version ?? 'current'],
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
