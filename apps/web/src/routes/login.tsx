import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Box } from 'lucide-react'
import { z } from 'zod'
import { api } from '#/lib/api'
import { authClient } from '#/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ThemeToggle } from '@/components/theme-toggle'

const searchSchema = z.object({
  callback: z.string().optional(),
})

export const Route = createFileRoute('/login')({
  validateSearch: searchSchema,
  component: LoginPage,
})

function safeCallback(value?: string): string {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/home'
}

interface AuthConfig {
  googleEnabled: boolean
  passwordEnabled: boolean
}

function LoginPage() {
  const { callback } = Route.useSearch()
  const destination = safeCallback(callback)
  const invitationSignup = destination.startsWith('/invite/')
  const session = authClient.useSession()
  const [config, setConfig] = useState<AuthConfig | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (session.data) location.assign(destination)
  }, [destination, session.data])

  useEffect(() => {
    api<{ data: AuthConfig }>('/api/v1/auth-config')
      .then(({ data }) => {
        setConfig(data)
      })
      .catch((cause: unknown) =>
        setError(
          cause instanceof Error ? cause.message : 'Could not load login.',
        ),
      )
  }, [])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    const signingUp = invitationSignup
    const callbackURL = destination
    const result = signingUp
      ? await authClient.signUp.email({ name, email, password, callbackURL })
      : await authClient.signIn.email({ email, password, callbackURL })
    if (result.error) setError(result.error.message ?? 'Authentication failed.')
    else location.assign(callbackURL)
  }

  const signingUp = invitationSignup
  const heading = invitationSignup ? 'Accept your invitation' : 'Welcome back'

  return (
    <main className="auth-page">
      <ThemeToggle className="auth-theme-toggle" />
      <Card className="auth-card">
        <div className="auth-brand">
          <Box size={19} /> Otter Drive
        </div>
        <div>
          <p className="eyebrow">Private collaboration</p>
          <h1>{heading}</h1>
          <p>
            Access is invitation-only. Use the account your administrator
            invited.
          </p>
        </div>
        {config?.googleEnabled && (
          <Button
            variant="outline"
            className="w-full"
            type="button"
            onClick={() =>
              void authClient.signIn.social({
                provider: 'google',
                callbackURL: destination,
              })
            }
          >
            Continue with Google
          </Button>
        )}
        {config?.passwordEnabled && (
          <>
            {config.googleEnabled && (
              <div className="auth-divider">
                <span>or</span>
              </div>
            )}
            <form className="auth-form" onSubmit={submit}>
              {signingUp && (
                <label>
                  Name
                  <Input
                    required
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
              )}
              <label>
                Email
                <Input
                  required
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              <label>
                Password
                <Input
                  required
                  minLength={8}
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              {!signingUp && (
                <a className="auth-link" href="/forgot-password">
                  Forgot your password?
                </a>
              )}
              {error && <p className="form-error">{error}</p>}
              <Button className="w-full" type="submit">
                {signingUp ? 'Create account' : 'Sign in'}
              </Button>
            </form>
          </>
        )}
        {!config && !error && (
          <div className="auth-loading" role="status" aria-label="Loading">
            <div className="spinner" />
          </div>
        )}
        {error && !config && <p className="form-error">{error}</p>}
      </Card>
    </main>
  )
}
