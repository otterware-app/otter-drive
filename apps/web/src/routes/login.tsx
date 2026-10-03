import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { authClient } from '#/lib/auth-client'
import { AuthMessage, AuthShell } from '#/main/auth/auth-shell'
import { Button } from '@/components/ui/button'

const searchSchema = z.object({
  callback: z.string().optional(),
  error: z.string().optional(),
})
export const Route = createFileRoute('/login')({
  validateSearch: searchSchema,
  component: LoginPage,
})

/** Callback destinations always stay on Drive. */
export function safeCallback(value?: string): string {
  return value?.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\')
    ? value
    : '/home'
}

function LoginPage() {
  const search = Route.useSearch()
  const destination = safeCallback(search.callback)
  const session = authClient.useSession()
  const [error, setError] = useState<string | null>(
    search.error
      ? 'Sign-in could not be completed. Use your Otter account and try again.'
      : null,
  )
  const [submitting, setSubmitting] = useState(false)
  useEffect(() => {
    if (session.data) location.assign(destination)
  }, [destination, session.data])

  async function signIn() {
    setError(null)
    setSubmitting(true)
    try {
      const result = await authClient.signIn.social({
        provider: 'otter',
        callbackURL: destination,
        errorCallbackURL: `/login?callback=${encodeURIComponent(destination)}`,
      })
      if (result.error)
        throw new Error(result.error.message ?? 'Could not start sign-in.')
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not start sign-in.',
      )
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      title="Welcome to Otter Drive"
      description="Use the same Otter account as Otter Mail. Sign in with Google for your personal drive and any shared drives you have been invited to."
    >
      <Button
        size="lg"
        className="w-full"
        disabled={submitting}
        onClick={() => void signIn()}
      >
        {submitting ? 'Signing in…' : 'Continue with Otter'}
      </Button>
      {error ? <AuthMessage tone="error">{error}</AuthMessage> : null}
    </AuthShell>
  )
}
