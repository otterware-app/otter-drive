import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { LoaderIcon } from 'lucide-react'
import { authClient } from '#/lib/auth-client'
import { AuthGate } from '#/main/auth/auth-gate'
import { AuthMessage, AuthShell } from '#/main/auth/auth-shell'

export const Route = createFileRoute('/invite/$invitationId')({
  component: InvitePage,
})

function InvitePage() {
  return (
    <AuthGate fallback={<AuthShell title="Joining a team" />}>
      <AcceptInvitation />
    </AuthGate>
  )
}

function AcceptInvitation() {
  const { invitationId } = Route.useParams()
  const [error, setError] = useState<string | null>(null)
  const [accepted, setAccepted] = useState(false)

  useEffect(() => {
    authClient.organization
      .acceptInvitation({ invitationId })
      .then((result) => {
        if (result.error)
          setError(result.error.message ?? 'Could not accept the invitation.')
        else {
          setAccepted(true)
          setTimeout(() => location.assign('/home'), 700)
        }
      })
  }, [invitationId])

  return (
    <AuthShell
      title={accepted ? 'You’re in' : 'Joining a team'}
      description={
        accepted
          ? 'Taking you to its documents…'
          : 'Accepting your invitation to Otter Drive.'
      }
    >
      {error ? (
        <AuthMessage tone="error">{error}</AuthMessage>
      ) : (
        <div className="flex justify-center text-muted-foreground">
          <LoaderIcon className="size-4 animate-spin" />
        </div>
      )}
    </AuthShell>
  )
}
