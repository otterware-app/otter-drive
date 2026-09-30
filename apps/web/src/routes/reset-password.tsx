import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Box } from 'lucide-react'
import { z } from 'zod'
import { authClient } from '#/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

const searchSchema = z.object({
  token: z.string().optional(),
  error: z.string().optional(),
})

export const Route = createFileRoute('/reset-password')({
  validateSearch: searchSchema,
  component: ResetPasswordPage,
})

export function ResetPasswordPage() {
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
      result = await authClient.resetPassword({
        newPassword: password,
        token,
      })
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

  return (
    <main className="auth-page">
      <Card className="auth-card">
        <div className="auth-brand">
          <Box size={19} /> Otter Drive
        </div>
        <div>
          <p className="eyebrow">Account recovery</p>
          <h1>{complete ? 'Password updated' : 'Choose a new password'}</h1>
          <p>
            {complete
              ? 'Your other sessions have been signed out. You can now sign in with your new password.'
              : 'Use at least eight characters for your new password.'}
          </p>
        </div>
        {complete ? (
          <a className="auth-link" href="/login">
            Continue to sign in
          </a>
        ) : invalidToken ? (
          <div className="auth-form">
            <p className="form-error">
              This password reset link is invalid or has expired.
            </p>
            <a className="auth-link" href="/forgot-password">
              Request another link
            </a>
          </div>
        ) : (
          <form className="auth-form" onSubmit={submit}>
            <label>
              New password
              <Input
                required
                minLength={8}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <label>
              Confirm new password
              <Input
                required
                minLength={8}
                type="password"
                autoComplete="new-password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </label>
            {error && <p className="form-error">{error}</p>}
            <Button className="w-full" type="submit" disabled={submitting}>
              {submitting ? 'Updating…' : 'Update password'}
            </Button>
          </form>
        )}
      </Card>
    </main>
  )
}
