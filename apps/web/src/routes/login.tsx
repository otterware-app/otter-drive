import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { LoaderIcon } from 'lucide-react'
import { z } from 'zod'
import { api } from '#/lib/api'
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
  callback: z.string().optional(),
})

export const Route = createFileRoute('/login')({
  validateSearch: searchSchema,
  component: LoginPage,
})

/** Only paths on this site: not `//host` or `/\host`, which browsers
 *  read as another origin. */
function safeCallback(value?: string): string {
  return value?.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\')
    ? value
    : '/home'
}

interface AuthConfig {
  googleEnabled: boolean
  passwordEnabled: boolean
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.94l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.6 10.6 0 0 0 12 1 11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  )
}

function LoginPage() {
  const { callback } = Route.useSearch()
  const destination = safeCallback(callback)
  const signingUp = destination.startsWith('/invite/')
  const session = authClient.useSession()
  const [config, setConfig] = useState<AuthConfig | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (session.data) location.assign(destination)
  }, [destination, session.data])

  useEffect(() => {
    api<{ data: AuthConfig }>('/api/v1/auth-config')
      .then(({ data }) => setConfig(data))
      .catch((cause: unknown) =>
        setError(
          cause instanceof Error ? cause.message : 'Could not load sign-in.',
        ),
      )
  }, [])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    const result = signingUp
      ? await authClient.signUp.email({
          name,
          email,
          password,
          callbackURL: destination,
        })
      : await authClient.signIn.email({
          email,
          password,
          callbackURL: destination,
        })
    if (result.error) {
      setError(result.error.message ?? 'Authentication failed.')
      setSubmitting(false)
    } else location.assign(destination)
  }

  return (
    <AuthShell
      title={signingUp ? 'Accept your invitation' : 'Welcome back'}
      description={
        signingUp
          ? 'Create your account with the address you were invited at.'
          : 'Otter Drive is invitation-only. Sign in with the account you were invited with.'
      }
      footer={
        config?.passwordEnabled && !signingUp ? (
          <AuthLink href="/forgot-password">Forgot your password?</AuthLink>
        ) : null
      }
    >
      {!config && !error ? (
        <div
          className="flex justify-center py-6 text-muted-foreground"
          role="status"
          aria-label="Loading"
        >
          <LoaderIcon className="size-4 animate-spin" />
        </div>
      ) : null}
      {config?.googleEnabled ? (
        <Button
          size="lg"
          className="w-full"
          onClick={() =>
            void authClient.signIn.social({
              provider: 'google',
              callbackURL: destination,
            })
          }
        >
          <GoogleIcon /> Continue with Google
        </Button>
      ) : null}
      {config?.googleEnabled && config.passwordEnabled ? (
        <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          or
          <span className="h-px flex-1 bg-border" />
        </div>
      ) : null}
      {config?.passwordEnabled ? (
        <AuthForm onSubmit={submit}>
          {signingUp ? (
            <Field label="Name">
              <Input
                size="lg"
                required
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
          ) : null}
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
          <Field label="Password">
            <Input
              size="lg"
              required
              minLength={8}
              type="password"
              autoComplete={signingUp ? 'new-password' : 'current-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
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
            {submitting
              ? signingUp
                ? 'Creating account…'
                : 'Signing in…'
              : signingUp
                ? 'Create account'
                : 'Sign in'}
          </Button>
        </AuthForm>
      ) : null}
      {error && !config ? (
        <AuthMessage tone="error">{error}</AuthMessage>
      ) : null}
    </AuthShell>
  )
}
