import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { authClient } from '#/lib/auth-client'
import { AuthGate } from '#/components/auth-gate'
import { ThemeToggle } from '@/components/theme-toggle'
import { Card } from '@/components/ui/card'

export const Route = createFileRoute('/invite/$invitationId')({
  component: InvitePage,
})

function InvitePage() {
  const { invitationId } = Route.useParams()
  const [status, setStatus] = useState('Accepting invitation…')
  useEffect(() => {
    authClient.organization
      .acceptInvitation({ invitationId })
      .then((result) => {
        if (result.error)
          setStatus(result.error.message ?? 'Could not accept invitation.')
        else {
          setStatus('Invitation accepted. Redirecting…')
          setTimeout(() => location.assign('/home'), 700)
        }
      })
  }, [invitationId])
  return (
    <AuthGate>
      <main className="centered-state">
        <ThemeToggle className="auth-theme-toggle" />
        <Card className="auth-card invitation-card">
          <p className="eyebrow">Team invitation</p>
          <h1>Joining Otter Drive</h1>
          <p>{status}</p>
        </Card>
      </main>
    </AuthGate>
  )
}
