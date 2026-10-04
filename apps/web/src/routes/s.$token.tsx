import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { LoaderIcon } from 'lucide-react'
import { acceptLinkResponseSchema } from '@otterware/contracts'
import { api } from '#/lib/api'
import { AuthGate } from '#/main/auth/auth-gate'
import { AuthShell } from '#/main/auth/auth-shell'

/**
 * A link shared with "anyone with the link": after signing in, opening it
 * adds you to the folder or document it shares, then opens it.
 */
export const Route = createFileRoute('/s/$token')({
  component: SharedLinkPage,
})

function SharedLinkPage() {
  return (
    <AuthGate fallback={<AuthShell title="Opening a shared link" />}>
      <AcceptLink />
    </AuthGate>
  )
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
