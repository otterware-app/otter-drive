import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { authClient } from '#/lib/auth-client'
import {
  AuthForm,
  AuthLink,
  AuthMessage,
  AuthShell,
} from '#/main/auth/auth-shell'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

const searchSchema = z.object({
  token: z.string().optional(),
  error: z.string().optional(),
})

export const Route = createFileRoute('/reset-password')({
  validateSearch: searchSchema,
  component: ResetPasswordPage,
})

function ResetPasswordPage() {
  const { token, error: tokenError } = Route.useSearch()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [complete, setComplete] = useState(false)
  const invalidToken = tokenError === 'INVALID_TOKEN' || !token

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    if (!token) return
    if (password !== confirmation) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    let result: Awaited<ReturnType<typeof authClient.resetPassword>>
    try {
      result = await authClient.resetPassword({ newPassword: password, token })
    } catch {
      setError('Could not reset your password. Please try again.')
      setSubmitting(false)
      return
    }

    if (result.error) {
      setError(result.error.message ?? 'Could not reset your password.')
      setSubmitting(false)
      return
    }
    setSubmitting(false)
    setComplete(true)
  }

  if (complete) {
    return (
      <AuthShell
        title="Password updated"
        description="Your other sessions have been signed out. Sign in with your new password."
      >
        <Button
          size="lg"
          variant="accent"
          className="w-full"
          onClick={() => location.assign('/login')}
        >
          Continue to sign in
        </Button>
      </AuthShell>
    )
  }

  if (invalidToken) {
    return (
      <AuthShell
        title="This link has expired"
        description="Password reset links work once, for a short while."
        footer={<AuthLink href="/login">Back to sign in</AuthLink>}
      >
        <Button
          size="lg"
          variant="accent"
          className="w-full"
          onClick={() => location.assign('/forgot-password')}
        >
          Request another link
        </Button>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Choose a new password"
      description="Use at least eight characters."
    >
      <AuthForm onSubmit={submit}>
        <Field label="New password">
          <Input
            size="lg"
            required
            minLength={8}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        <Field label="Confirm new password">
          <Input
            size="lg"
            required
            minLength={8}
            type="password"
            autoComplete="new-password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </Field>
        {error ? <AuthMessage tone="error">{error}</AuthMessage> : null}
        <Button
          size="lg"
          variant="accent"
          className="mt-1 w-full"
          type="submit"
          disabled={submitting}
        >
          {submitting ? 'Updating…' : 'Update password'}
        </Button>
      </AuthForm>
    </AuthShell>
  )
}
