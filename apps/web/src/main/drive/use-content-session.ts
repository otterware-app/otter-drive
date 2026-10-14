import { useQuery } from '@tanstack/react-query'
import {
  artifactPreviewResponseSchema,
  linkPreviewResponseSchema,
} from '@otterware/contracts'
import { api } from '#/lib/api'

// Content cookies last four hours. Refresh before that, and on returning to a
// stale reader, so late images and links use the session rather than URL grants.
const REFRESH_MS = 3 * 60 * 60 * 1_000

export function useContentSession({
  folderId,
  reference,
  version,
  enabled,
  linkToken,
}: {
  /** The folder you reach the document through; undefined when by id. */
  folderId: string | undefined
  /** Its slug in that folder, or its id. */
  reference: string
  version: number
  enabled: boolean
  /** Opened by a link, without signing in: the grant comes from the link. */
  linkToken?: string | undefined
}) {
  return useQuery({
    queryKey: [
      'content-session',
      linkToken ? `link:${linkToken}` : (folderId ?? 'shared'),
      reference,
      version,
    ],
    queryFn: async ({ signal }) => {
      const preview = linkToken
        ? linkPreviewResponseSchema.parse(
            await api<unknown>(
              `/api/v1/links/${encodeURIComponent(linkToken)}/documents/${encodeURIComponent(reference)}`,
              { signal },
            ),
          ).data
        : artifactPreviewResponseSchema.parse(
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
