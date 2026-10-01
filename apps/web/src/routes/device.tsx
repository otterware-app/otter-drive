import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { CheckIcon, XIcon } from 'lucide-react'
import { z } from 'zod'
import { authClient } from '#/lib/auth-client'
import { AuthMessage, AuthShell } from '#/main/auth/auth-shell'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

const searchSchema = z.object({
  user_code: z.string().optional(),
})

export const Route = createFileRoute('/device')({
  validateSearch: searchSchema,
  component: DevicePage,
})

function DevicePage() {
  const search = Route.useSearch()
  const session = authClient.useSession()
  const [code, setCode] = useState(search.user_code ?? '')
  const [status, setStatus] = useState<
    'idle' | 'ready' | 'approved' | 'denied'
  >('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!session.isPending && !session.data) {
      location.assign(
        `/login?callback=${encodeURIComponent(location.pathname + location.search)}`,
      )
    }
  }, [session.data, session.isPending])

  useEffect(() => {
    if (!session.data || !code) return
    authClient.device({ query: { user_code: code } }).then((result) => {
      if (result.error)
        setError(result.error.error_description ?? 'Invalid device code.')
      else {
        setError(null)
        setStatus('ready')
      }
    })
  }, [code, session.data])

  async function decide(approve: boolean) {
    setError(null)
    const result = approve
      ? await authClient.device.approve({ userCode: code })
      : await authClient.device.deny({ userCode: code })
    if (result.error)
      setError(
        result.error.error_description ?? 'Could not authorize the device.',
      )
    else setStatus(approve ? 'approved' : 'denied')
  }

  if (status === 'approved' || status === 'denied') {
    return (
      <AuthShell
        title={status === 'approved' ? 'Device connected' : 'Request denied'}
        description="You can close this tab and return to your terminal."
      >
        <div className="flex justify-center">
          <span
            className={
              status === 'approved'
                ? 'flex size-12 items-center justify-center rounded-full bg-success/12 text-success-foreground'
                : 'flex size-12 items-center justify-center rounded-full bg-error-surface text-error-foreground'
            }
          >
            {status === 'approved' ? (
              <CheckIcon className="size-6" />
            ) : (
              <XIcon className="size-6" />
            )}
          </span>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Connect a device"
      description="The otterdrive CLI is asking to act as you. Check the code matches your terminal."
    >
      <div className="flex flex-col gap-4 [&_input]:bg-canvas">
        <Field label="Code">
          <Input
            size="lg"
            font="mono"
            className="text-center tracking-[0.2em] uppercase"
            value={code}
            onChange={(event) => {
              setCode(event.target.value.toUpperCase())
              setStatus('idle')
            }}
          />
        </Field>
        {error ? <AuthMessage tone="error">{error}</AuthMessage> : null}
        <AuthMessage>
          Only approve devices or agents you recognize. They will act as your
          Otter Drive identity.
        </AuthMessage>
        <div className="mt-1 grid grid-cols-2 gap-2">
          <Button
            size="lg"
            disabled={status !== 'ready'}
            onClick={() => void decide(false)}
          >
            Deny
          </Button>
          <Button
            size="lg"
            variant="accent"
            disabled={status !== 'ready'}
            onClick={() => void decide(true)}
          >
            Approve
          </Button>
        </div>
      </div>
    </AuthShell>
  )
}
