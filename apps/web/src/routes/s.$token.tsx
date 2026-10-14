import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { LoaderIcon } from 'lucide-react'
import { acceptLinkResponseSchema } from '@otterware/contracts'
import { z } from 'zod'
import { api } from '#/lib/api'
import { authClient } from '#/lib/auth-client'
import { useHydrated } from '#/lib/session-cache'
import { AuthShell } from '#/main/auth/auth-shell'
import { LinkView } from '#/main/drive/link-view'

/**
 * A link shared with "anyone with the link". Signed in, opening it adds you
 * to the folder or document it shares, then opens it. Signed out, you view
 * it right here, read-only, without an account.
 */
export const Route = createFileRoute('/s/$token')({
  validateSearch: z.object({
    /** A folder inside a shared folder. */
    folder: z.string().max(256).optional().catch(undefined),
    /** A document opened from a shared folder. */
    doc: z.string().max(256).optional().catch(undefined),
  }),
  component: SharedLinkPage,
})

function SharedLinkPage() {
  const { token } = Route.useParams()
  const { folder, doc } = Route.useSearch()
  const session = authClient.useSession()
  // The client restores the session synchronously from its cache, so the
  // hydration render must keep showing the server's fallback to match.
  const hydrated = useHydrated()
  if (!hydrated || session.isPending)
    return <AuthShell title="Opening a shared link" />
  if (!session.data) return <LinkView token={token} folder={folder} doc={doc} />
  return <AcceptLink />
}

function AcceptLink() {
  const { token } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    api<unknown>(`/api/v1/links/${encodeURIComponent(token)}`, {
      method: 'POST',
    })
      .then(async (result) => {
        if (!active) return
        const { data } = acceptLinkResponseSchema.parse(result)
        // The new access shows in the folders and Shared with me at once.
        queryClient.removeQueries({ queryKey: ['folders'] })
        queryClient.removeQueries({ queryKey: ['shared-with-me'] })
        if (data.type === 'artifact' && data.slug)
          await navigate({
            to: '/$folderSlug/a/$slug',
            params: { folderSlug: data.folderSlug, slug: data.slug },
            replace: true,
          })
        else
          await navigate({
            to: '/home',
            search: { folder: data.folderId },
            replace: true,
          })
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : 'This link could not be opened.',
          )
      })
    return () => {
      active = false
    }
  }, [navigate, queryClient, token])

  return (
    <AuthShell
      title={error ? 'This link doesn’t work' : 'Opening a shared link'}
      description={error ?? 'Adding it to Shared with me…'}
    >
      {error ? null : (
        <div className="flex justify-center text-muted-foreground">
          <LoaderIcon className="size-4 animate-spin" />
        </div>
      )}
    </AuthShell>
  )
}
