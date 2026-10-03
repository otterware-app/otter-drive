import { useEffect, useState } from 'react'
import { api } from '#/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RowSelect } from '@/components/ui/select'
import { toast } from '@/components/ui/toast'
import { NewFolderDialog } from '../drive/new-folder-dialog'
import { announceFoldersChanged, driveForFolder, useFolders } from '../folders'
import {
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from './settings-ui'
export function FolderPane() {
  const { activeFolder: folder, folders, selectFolder } = useFolders(),
    drive = driveForFolder(folders, folder)
  const [name, setName] = useState(folder?.name ?? ''),
    [creating, setCreating] = useState(false)
  useEffect(() => setName(folder?.name ?? ''), [folder?.id, folder?.name])
  async function change(body: object) {
    try {
      await api(`/api/v1/folders/${folder!.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
      announceFoldersChanged()
      toast.success('Saved')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }
  return (
    <SettingsPageContainer
      title="Drives and folders"
      description="Your personal drive is private. Shared drive access applies to every folder inside it."
    >
      <SettingsSection title={folder?.name ?? 'Folder'}>
        <SettingsRow
          title="Name"
          control={
            folder?.role === 'owner' ? (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  void change({ name })
                }}
              >
                <Input
                  aria-label="Folder name"
                  value={name}
                  required
                  maxLength={80}
                  onChange={(e) => setName(e.target.value)}
                />
                <Button type="submit">Save</Button>
              </form>
            ) : (
              <span>{folder?.name}</span>
            )
          }
        />
        {folder?.kind === 'folder' && folder.role === 'owner' ? (
          <SettingsRow
            title="Move folder"
            description="Its subfolders move with it. Access follows the drive."
            control={
              <RowSelect
                ariaLabel="Parent folder"
                value={folder.parentId ?? undefined}
                options={folders
                  .filter(
                    (f) =>
                      f.id !== folder.id &&
                      driveForFolder(folders, f)?.id === drive?.id,
                  )
                  .map((f) => ({ value: f.id, label: f.name }))}
                onValueChange={(id) => void change({ parentId: id })}
              />
            }
          />
        ) : null}
        {folder?.role === 'owner' && folder.kind !== 'personal' ? (
          <SettingsRow
            title="Delete empty folder"
            description="Remove documents and subfolders first."
            control={
              <Button
                variant="ghost-destructive"
                onClick={() => {
                  if (!confirm(`Delete “${folder.name}”?`)) return
                  void api(`/api/v1/folders/${folder.id}`, { method: 'DELETE' })
                    .then(async () => {
                      announceFoldersChanged()
                      if (folder.parentId) await selectFolder(folder.parentId)
                    })
                    .catch((e) => toast.error(e.message))
                }}
              >
                Delete
              </Button>
            }
          />
        ) : null}
      </SettingsSection>
      <SettingsSection title="Shared drives">
        <SettingsRow
          title="New shared drive"
          description="A separate drive you can invite people to."
          control={
            <Button onClick={() => setCreating(true)}>
              Create shared drive
            </Button>
          }
        />
      </SettingsSection>
      <NewFolderDialog
        kind="shared"
        open={creating}
        onOpenChange={setCreating}
      />
    </SettingsPageContainer>
  )
}
