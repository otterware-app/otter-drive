import { useCallback, useEffect, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { authClient } from '#/lib/auth-client'
import { AuthMessage, AuthShell } from '#/main/auth/auth-shell'
import { Button } from '@/components/ui/button'

export const searchSchema = z.object({
  callback: z.string().optional(),
  error: z.string().optional(),
  // TanStack Router parses the query value in ?signed_out=1 as a number.
  signed_out: z
    .union([z.literal(1), z.literal('1')])
    .optional()
    .catch(undefined),
})
export const Route = createFileRoute('/login')({
  validateSearch: searchSchema,
  component: LoginPage,
})

/** Callback destinations always stay on Drive. */
export function safeCallback(value?: string): string {
  return value?.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\') &&
    // Browsers strip tabs and newlines before parsing a navigation URL.
    !/\p{Cc}/u.test(value)
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
  const attempting = useRef(false)
  useEffect(() => {
    if (session.data) location.assign(destination)
  }, [destination, session.data])

  const signIn = useCallback(async () => {
    if (attempting.current) return
    attempting.current = true
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
      attempting.current = false
    }
  }, [destination])

  useEffect(() => {
    if (session.isPending || session.data || search.error || search.signed_out)
      return
    const controller = new AbortController()
    void (async () => {
      const config = await fetch('/api/auth/browser-session', {
        signal: controller.signal,
      })
      if (!config.ok) return
      const { url } = (await config.json()) as { url: string }
      const response = await fetch(url, {
        credentials: 'include',
        signal: controller.signal,
      })
      if (
        response.ok &&
        ((await response.json()) as { signedIn: boolean }).signedIn &&
        !controller.signal.aborted
      )
        await signIn()
    })().catch(() => {
      /* Sign-in remains available when Accounts cannot be reached. */
    })
    return () => controller.abort()
  }, [session.isPending, session.data, search.error, search.signed_out, signIn])

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
