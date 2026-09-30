import { useEffect } from 'react'
import { authClient } from '#/lib/auth-client'
import { useHydrated } from '#/lib/session-cache'

export function AuthGate({
  children,
  fallback,
}: {
  children: React.ReactNode
  fallback?: React.ReactNode
}) {
  const session = authClient.useSession()
  // The client restores the session synchronously from its cache, so the
  // hydration render must keep showing the server's fallback to match.
  const hydrated = useHydrated()

  useEffect(() => {
    if (!session.isPending && !session.data) {
      const callback = `${location.pathname}${location.search}`
      location.assign(`/login?callback=${encodeURIComponent(callback)}`)
    }
  }, [session.data, session.isPending])

  if (!hydrated || session.isPending || !session.data) {
    if (fallback) return fallback
    return (
      <main className="centered-state">
        <div className="spinner" />
        <p>Loading Otter Drive…</p>
      </main>
    )
  }
  return children
}
