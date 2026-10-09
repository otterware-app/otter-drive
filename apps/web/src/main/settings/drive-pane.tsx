import { useEffect, useState } from 'react'
import { api } from '#/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { requestFolderDialog } from '../drive/folder-dialogs'
import { announceFoldersChanged, folderLabel } from '../folders'
import { DriveScope, useSettingsDrive } from './drive-scope'
import {
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from './settings-ui'

/**
 * A drive's general settings: its name and what kind of drive it is, and
 * deleting it. Folders inside it are renamed, moved and deleted from their
 * own menus.
 */
export function DrivePane() {
  const { drive, drives, selectDrive } = useSettingsDrive()
  const [name, setName] = useState(drive?.name ?? '')
  useEffect(() => setName(drive?.name ?? ''), [drive?.id, drive?.name])
  const owner = drive?.role === 'owner'
  const shared = drive?.kind === 'shared'

  async function rename(event: React.FormEvent) {
    event.preventDefault()
    if (!drive) return
    try {
      await api(`/api/v1/folders/${encodeURIComponent(drive.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: name.trim() }),
      })
      announceFoldersChanged()
      toast.success('Renamed')
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : String(reason))
    }
  }

  return (
    <SettingsPageContainer
      scope={<DriveScope />}
      title="General"
      description={
        shared
          ? 'A shared drive: its members open every folder and document in it.'
          : 'Your personal drive. Share its folders and documents from their menus.'
      }
    >
      {drive ? (
        <SettingsSection title="Drive">
          <SettingsRow
            title="Name"
            description={
              shared
                ? owner
                  ? undefined
                  : 'Only the drive’s owner renames it.'
                : 'Your personal drive is always called My Drive.'
            }
            control={
              shared && owner ? (
                <form className="flex gap-2" onSubmit={rename}>
                  <Input
                    aria-label="Drive name"
                    value={name}
                    required
                    maxLength={80}
                    onChange={(event) => setName(event.target.value)}
                  />
                  <Button
                    type="submit"
                    disabled={!name.trim() || name.trim() === drive.name}
                  >
                    Save
                  </Button>
                </form>
              ) : (
                <span className="text-sm text-foreground">
                  {folderLabel(drive)}
                </span>
              )
            }
          />
          <SettingsRow
            title="Your access"
            description={
              owner
                ? shared
                  ? 'You own it: you manage its members, storage and name.'
                  : 'It’s yours alone.'
                : drive.role === 'editor'
                  ? 'You can add and edit documents.'
                  : 'You can open its documents.'
            }
            control={
              <span className="text-sm text-foreground">
                {owner
                  ? 'Owner'
                  : drive.role === 'editor'
                    ? 'Editor'
                    : 'Viewer'}
              </span>
            }
          />
        </SettingsSection>
      ) : null}
      {drive && shared && owner ? (
        <SettingsSection title="Danger zone">
          <SettingsRow
            title="Delete this shared drive"
            description="Its members lose it. It must be empty first."
            control={
              <Button
                variant="ghost-destructive"
                onClick={() =>
                  requestFolderDialog({
                    action: 'delete',
                    folder: drive,
                    onDeleted: () => {
                      const next = drives.find((item) => item.id !== drive.id)
                      if (next) selectDrive(next)
                    },
                  })
                }
              >
                Delete drive…
              </Button>
            }
          />
        </SettingsSection>
      ) : null}
    </SettingsPageContainer>
  )
}
