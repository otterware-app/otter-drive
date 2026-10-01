import { useEffect, useState } from 'react'
import type { Artifact } from '@otterware/contracts'
import { api } from '#/lib/api'
import { Dialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'

/**
 * Permanent deletion, asked from anywhere (a row's menu, the viewer) and
 * confirmed in one dialog the home view keeps mounted: type the document's
 * slug to delete every version and file.
 */

const DELETE_EVENT = 'otterdrive:delete-document'

type DeleteRequest = {
  artifact: Artifact
  teamId: string
  onDeleted?: (artifact: Artifact) => void
}

export function requestDeleteDocument(request: DeleteRequest) {
  window.dispatchEvent(new CustomEvent(DELETE_EVENT, { detail: request }))
}

export function DeleteDocumentDialogHost({
  onDeleted,
}: {
  /** Runs after any deletion (the lists drop the document). */
  onDeleted: (artifact: Artifact, teamId: string) => void
}) {
  const [request, setRequest] = useState<DeleteRequest | null>(null)
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const open = (event: Event) => {
      setRequest((event as CustomEvent<DeleteRequest>).detail)
      setConfirmation('')
      setError(null)
    }
    window.addEventListener(DELETE_EVENT, open)
    return () => window.removeEventListener(DELETE_EVENT, open)
  }, [])

  const artifact = request?.artifact

  async function remove() {
    if (!request || confirmation !== request.artifact.slug) return
    setError(null)
    try {
      await api<void>(
        `/api/v1/artifacts/${encodeURIComponent(request.artifact.id)}/permanent`,
        { method: 'DELETE', organizationId: request.teamId },
      )
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason)
      setError(message)
      throw reason
    }
    onDeleted(request.artifact, request.teamId)
    request.onDeleted?.(request.artifact)
    toast.success(`Deleted “${request.artifact.title}”`)
  }

  return (
    <Dialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) setRequest(null)
      }}
      title="Delete permanently?"
      description={
        <>
          Every version and file of{' '}
          <span className="font-medium text-foreground">{artifact?.title}</span>{' '}
          goes for good. This can’t be undone.
        </>
      }
      confirmLabel="Delete permanently"
      confirmVariant="destructive"
      confirmDisabled={!artifact || confirmation !== artifact.slug}
      onConfirm={remove}
    >
      <Field
        label={
          <>
            Type{' '}
            <code className="font-mono text-foreground">{artifact?.slug}</code>{' '}
            to confirm
          </>
        }
        error={error}
      >
        <Input
          font="mono"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </Field>
    </Dialog>
  )
}
