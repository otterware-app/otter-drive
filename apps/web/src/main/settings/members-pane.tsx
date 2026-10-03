import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '#/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RowSelect } from '@/components/ui/select'
import { toast } from '@/components/ui/toast'
import { announceFoldersChanged, driveForFolder, useFolders } from '../folders'
import {
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from './settings-ui'
interface Member {
  id: string
  email: string
  role: 'viewer' | 'editor'
  userId: string | null
}
export function MembersPane() {
  const { folders, activeFolder } = useFolders(),
    drive = driveForFolder(folders, activeFolder),
    qc = useQueryClient()
  const [email, setEmail] = useState(''),
    [role, setRole] = useState<'viewer' | 'editor'>('editor'),
    [saving, setSaving] = useState(false)
  const enabled = drive?.kind === 'shared' && drive.role === 'owner'
  const query = useQuery({
    queryKey: ['drive-members', drive?.id],
    enabled,
    queryFn: () =>
      api<{ data: Member[] }>(`/api/v1/folders/${drive!.id}/members`),
  })
  async function invite(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await api(`/api/v1/folders/${drive!.id}/members`, {
        method: 'POST',
        body: JSON.stringify({ email, role }),
      })
      setEmail('')
      await qc.invalidateQueries({ queryKey: ['drive-members', drive?.id] })
      toast.success('Access granted. Share a link to this drive with them.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }
  async function remove(id: string) {
    try {
      await api(`/api/v1/folders/${drive!.id}/members/${id}`, {
        method: 'DELETE',
      })
      await qc.invalidateQueries({ queryKey: ['drive-members', drive?.id] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }
  return (
    <SettingsPageContainer
      title="Shared drive access"
      description={
        drive?.kind === 'shared'
          ? `Access to ${drive.name} includes all its folders and documents.`
          : 'Your personal drive is private. Create a shared drive to collaborate.'
      }
    >
      {enabled ? (
        <>
          <SettingsSection title="Invite people">
            <SettingsRow
              title="Google email"
              description="They sign in with this Google account. No email is sent; copy and send them the drive link."
            >
              <form onSubmit={invite} className="mt-3 flex gap-2">
                <Input
                  aria-label="Email to invite"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <RowSelect
                  ariaLabel="Access"
                  value={role}
                  options={[
                    { value: 'editor', label: 'Can edit' },
                    { value: 'viewer', label: 'Can view' },
                  ]}
                  onValueChange={(v) => setRole(v as typeof role)}
                />
                <Button type="submit" disabled={saving}>
                  Invite
                </Button>
              </form>
            </SettingsRow>
            <SettingsRow
              title="Drive link"
              control={
                <Button
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(
                        `${location.origin}/home?folder=${encodeURIComponent(drive!.id)}`,
                      )
                      .then(() => toast.success('Link copied'))
                  }
                >
                  Copy link
                </Button>
              }
            />
          </SettingsSection>
          <SettingsSection title="People with access">
            {query.data?.data.map((m) => (
              <SettingsRow
                key={m.id}
                title={m.email}
                description={`${m.role === 'editor' ? 'Can edit' : 'Can view'}${m.userId ? '' : ' · Pending sign-in'}`}
                control={
                  <div className="flex gap-2">
                    {m.userId ? (
                      <Button
                        onClick={() => {
                          if (
                            !confirm(
                              `Transfer this shared drive to ${m.email}? You will become an editor.`,
                            )
                          )
                            return
                          void api(`/api/v1/folders/${drive!.id}/owner`, {
                            method: 'POST',
                            body: JSON.stringify({ userId: m.userId }),
                          })
                            .then(() => {
                              announceFoldersChanged()
                              void qc.invalidateQueries({ queryKey: ['actor'] })
                              toast.success('Ownership transferred')
                            })
                            .catch((e) => toast.error(e.message))
                        }}
                      >
                        Make owner
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost-destructive"
                      onClick={() => void remove(m.id)}
                    >
                      Remove
                    </Button>
                  </div>
                }
              />
            ))}
            {query.error ? <p role="alert">{query.error.message}</p> : null}
            {query.data?.data.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                Only you have access.
              </p>
            ) : null}
          </SettingsSection>
        </>
      ) : drive?.kind === 'shared' ? (
        <p className="p-4 text-sm text-muted-foreground">
          The drive owner manages invitations.
        </p>
      ) : null}
    </SettingsPageContainer>
  )
}
