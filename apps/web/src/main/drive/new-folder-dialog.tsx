import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { api } from '#/lib/api'
import { Dialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { announceFoldersChanged, useFolders, type Folder } from '../folders'
export function NewFolderDialog({
  open,
  onOpenChange,
  kind = 'folder',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind?: 'folder' | 'shared'
}) {
  const { activeFolder, selectFolder } = useFolders(),
    navigate = useNavigate()
  const [name, setName] = useState(''),
    [error, setError] = useState<string | null>(null)
  async function create() {
    try {
      const result = await api<{ data: Folder }>('/api/v1/folders', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          kind,
          ...(kind === 'folder' ? { parentId: activeFolder?.id } : {}),
        }),
      })
      announceFoldersChanged()
      await selectFolder(result.data.id)
      setName('')
      await navigate({ to: '/home' })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      throw e
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={kind === 'shared' ? 'New shared drive' : 'New folder'}
      description={
        kind === 'shared'
          ? 'Invite people to view or edit everything in this drive.'
          : `Inside ${activeFolder?.name ?? 'your drive'}.`
      }
      confirmLabel="Create"
      confirmDisabled={!name.trim()}
      onConfirm={create}
      size="small"
    >
      <Field label="Name" error={error}>
        <Input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={kind === 'shared' ? 'Project' : 'Folder name'}
        />
      </Field>
    </Dialog>
  )
}
