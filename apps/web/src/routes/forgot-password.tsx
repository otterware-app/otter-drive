import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
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

export const Route = createFileRoute('/forgot-password')({
  component: ForgotPasswordPage,
})

function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    try {
      await authClient.requestPasswordReset({
        email,
        redirectTo: `${location.origin}/reset-password`,
      })
    } catch {
      // Keep the response indistinguishable from a request for an unknown user.
    } finally {
      // A single response prevents revealing whether an account exists.
      setSubmitted(true)
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      title="Reset your password"
      description="Enter your account’s email and we’ll send you a link to choose a new one."
      footer={<AuthLink href="/login">Back to sign in</AuthLink>}
    >
      {submitted ? (
        <AuthMessage tone="success">
          If an account exists for that address, a reset link is on its way.
        </AuthMessage>
      ) : (
        <AuthForm onSubmit={submit}>
          <Field label="Email">
            <Input
              size="lg"
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <Button
            size="lg"
            variant="accent"
            className="mt-1 w-full"
            type="submit"
            disabled={submitting}
          >
            {submitting ? 'Sending…' : 'Send reset link'}
          </Button>
        </AuthForm>
      )}
    </AuthShell>
  )
}
