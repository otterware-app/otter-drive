import { useQuery } from '@tanstack/react-query'
import { artifactPreviewResponseSchema } from '@otterware/contracts'
import { api } from '#/lib/api'

// Content cookies last four hours. Refresh before that, and on returning to a
// stale reader, so late images and links use the session rather than URL grants.
const REFRESH_MS = 3 * 60 * 60 * 1_000

export function useContentSession({
  folderId,
  reference,
  version,
  enabled,
}: {
  /** The folder you reach the document through; undefined when by id. */
  folderId: string | undefined
  /** Its slug in that folder, or its id. */
  reference: string
  version: number
  enabled: boolean
}) {
  return useQuery({
    queryKey: ['content-session', folderId ?? 'shared', reference, version],
    queryFn: async ({ signal }) => {
      const preview = artifactPreviewResponseSchema.parse(
        await api<unknown>(
          `/api/v1/artifacts/${encodeURIComponent(reference)}/preview?version=${version}`,
          { folderId, signal },
        ),
      ).data
      // Fetching follows the redirect and establishes the isolated origin's
      // HttpOnly cookie. Uploaded content is never executed in the app.
      await fetch(preview.url, {
        mode: 'no-cors',
        credentials: 'include',
        signal,
      })
      return preview.resourceBaseUrl
    },
    enabled: enabled && !import.meta.env.SSR,
    staleTime: REFRESH_MS,
    gcTime: 4 * 60 * 60 * 1_000,
    refetchInterval: REFRESH_MS,
    refetchOnWindowFocus: true,
    retry: false,
  })
}
