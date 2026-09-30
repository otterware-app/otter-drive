import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Box } from 'lucide-react'
import { authClient } from '#/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

export const Route = createFileRoute('/forgot-password')({
  component: ForgotPasswordPage,
})

export function ForgotPasswordPage() {
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
    <main className="auth-page">
      <Card className="auth-card">
        <div className="auth-brand">
          <Box size={19} /> Otter Drive
        </div>
        <div>
          <p className="eyebrow">Account recovery</p>
          <h1>Reset your password</h1>
          <p>
            Enter your account email and we’ll send you a password reset link.
          </p>
        </div>
        {submitted ? (
          <div className="auth-form">
            <p>
              If an account exists for that address, a reset link is on its way.
            </p>
            <a className="auth-link" href="/login">
              Return to sign in
            </a>
          </div>
        ) : (
          <form className="auth-form" onSubmit={submit}>
            <label>
              Email
              <Input
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <Button className="w-full" type="submit" disabled={submitting}>
              {submitting ? 'Sending…' : 'Send reset link'}
            </Button>
            <a className="auth-link" href="/login">
              Return to sign in
            </a>
          </form>
        )}
      </Card>
    </main>
  )
}
