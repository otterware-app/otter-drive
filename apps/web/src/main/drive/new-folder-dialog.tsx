import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { api } from '#/lib/api'
import { Dialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import {
  announceFoldersChanged,
  folderLabel,
  useFolders,
  type Folder,
} from '../folders'

/**
 * A new shared drive (which opens), or a folder inside `parent` (the open
 * folder by default), which appears where you are, as in Google Drive.
 */
export function NewFolderDialog({
  open,
  onOpenChange,
  kind = 'folder',
  parent,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind?: 'folder' | 'shared'
  parent?: Folder | null
}) {
  const { activeFolder, selectFolder } = useFolders(),
    navigate = useNavigate()
  const inside = parent ?? activeFolder
  const [name, setName] = useState(''),
    [error, setError] = useState<string | null>(null)
  async function create() {
    try {
      const result = await api<{ data: Folder }>('/api/v1/folders', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          kind,
          ...(kind === 'folder' ? { parentId: inside?.id } : {}),
        }),
      })
      announceFoldersChanged()
      setName('')
      if (kind === 'shared') {
        await selectFolder(result.data.id)
        await navigate({ to: '/home', search: {} })
      } else toast.success(`Created “${result.data.name}”`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      throw e
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null)
        onOpenChange(next)
      }}
      title={kind === 'shared' ? 'New shared drive' : 'New folder'}
      description={
        kind === 'shared'
          ? 'A drive you share with a team: its members open everything in it.'
          : `Inside ${inside ? folderLabel(inside) : 'your drive'}.`
      }
      confirmLabel="Create"
      confirmDisabled={!name.trim()}
      onConfirm={create}
      size="small"
    >
      <Field label="Name" error={error}>
        <Input
          required
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={kind === 'shared' ? 'Project' : 'Untitled folder'}
        />
      </Field>
    </Dialog>
  )
}

const NEW_FOLDER_EVENT = 'otterdrive:new-folder'

/** A new folder inside `parent`, from a folder's menu. */
export function requestNewFolder(parent: Folder) {
  window.dispatchEvent(new CustomEvent(NEW_FOLDER_EVENT, { detail: parent }))
}

export function NewFolderDialogHost() {
  const [parent, setParent] = useState<Folder | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const show = (event: Event) => {
      setParent((event as CustomEvent<Folder>).detail)
      setOpen(true)
    }
    window.addEventListener(NEW_FOLDER_EVENT, show)
    return () => window.removeEventListener(NEW_FOLDER_EVENT, show)
  }, [])
  return <NewFolderDialog open={open} onOpenChange={setOpen} parent={parent} />
}
