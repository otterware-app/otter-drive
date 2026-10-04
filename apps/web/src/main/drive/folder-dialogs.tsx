import { useEffect, useState } from 'react'
import { api } from '#/lib/api'
import { Dialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { announceFoldersChanged, folderLabel, type Folder } from '../folders'

/**
 * Renaming and deleting a folder, asked from its menus with
 * `requestFolderDialog()` and kept mounted by the home view.
 */

type FolderDialogRequest = {
  action: 'rename' | 'delete'
  folder: Folder
  onDeleted?: (folder: Folder) => void
}

const FOLDER_DIALOG_EVENT = 'otterdrive:folder-dialog'

export function requestFolderDialog(request: FolderDialogRequest) {
  window.dispatchEvent(
    new CustomEvent(FOLDER_DIALOG_EVENT, { detail: request }),
  )
}

export function FolderDialogsHost() {
  const [request, setRequest] = useState<FolderDialogRequest | null>(null)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const show = (event: Event) => {
      const detail = (event as CustomEvent<FolderDialogRequest>).detail
      setRequest(detail)
      setName(detail.folder.name)
      setError(null)
      setOpen(true)
    }
    window.addEventListener(FOLDER_DIALOG_EVENT, show)
    return () => window.removeEventListener(FOLDER_DIALOG_EVENT, show)
  }, [])

  const folder = request?.folder
  const isDrive = folder?.parentId === null

  async function rename() {
    if (!folder) return
    setError(null)
    try {
      await api(`/api/v1/folders/${encodeURIComponent(folder.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: name.trim() }),
      })
      announceFoldersChanged()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      throw reason
    }
  }

  async function remove() {
    if (!folder) return
    setError(null)
    try {
      await api(`/api/v1/folders/${encodeURIComponent(folder.id)}`, {
        method: 'DELETE',
      })
      announceFoldersChanged()
      toast.success(`Deleted “${folder.name}”`)
      request?.onDeleted?.(folder)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      throw reason
    }
  }

  if (request?.action === 'delete')
    return (
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={`Delete “${folder ? folderLabel(folder) : ''}”?`}
        description={
          isDrive
            ? 'The shared drive goes for good, and its members lose it. It must be empty.'
            : 'The folder goes for good, and anyone it was shared with loses it. It must be empty.'
        }
        confirmLabel="Delete"
        confirmVariant="destructive"
        onConfirm={remove}
        size="small"
      >
        {error ? (
          <p role="alert" className="text-[13px] text-destructive-foreground">
            {error}
          </p>
        ) : null}
      </Dialog>
    )
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={isDrive ? 'Rename shared drive' : 'Rename folder'}
      confirmLabel="Rename"
      confirmDisabled={!name.trim() || name.trim() === folder?.name}
      onConfirm={rename}
      size="small"
    >
      <Field label="Name" error={error}>
        <Input
          required
          maxLength={80}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onFocus={(event) => event.currentTarget.select()}
        />
      </Field>
    </Dialog>
  )
}
