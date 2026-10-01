import { useEffect, useState } from 'react'
import { authClient } from '#/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RowSelect } from '@/components/ui/select'
import { toast } from '@/components/ui/toast'
import { NewTeamDialog } from '../drive/new-team-dialog'
import { useCanCreateTeams } from '../drive/team-rail'
import { useTeamRole } from '../team-role'
import { announceTeamsChanged, useTeams } from '../teams'
import {
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from './settings-ui'

export function TeamPane() {
  const { activeTeam: team, teams, selectTeam } = useTeams()
  const { canManage } = useTeamRole(team?.id, Boolean(team))
  const canCreateTeams = useCanCreateTeams()
  const [name, setName] = useState(team?.name ?? '')
  const [saving, setSaving] = useState(false)
  const [newTeamOpen, setNewTeamOpen] = useState(false)

  useEffect(() => setName(team?.name ?? ''), [team?.id, team?.name])

  async function rename(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!team || !trimmed || trimmed === team.name) return
    setSaving(true)
    const result = await authClient.organization.update({
      organizationId: team.id,
      data: { name: trimmed },
    })
    setSaving(false)
    if (result.error) {
      toast.error('Could not rename the team', {
        description: result.error.message,
      })
      return
    }
    toast.success(`Renamed to ${trimmed}`)
    announceTeamsChanged()
  }

  return (
    <SettingsPageContainer
      title="Team"
      description={
        team
          ? `Documents, members and agents belong to a team. These are ${team.name}’s.`
          : 'Documents, members and agents belong to a team.'
      }
    >
      <SettingsSection title="General">
        <SettingsRow
          title="Active team"
          description="Home, uploads and Settings follow it. The rail switches it too."
          control={
            <RowSelect
              ariaLabel="Active team"
              value={team?.id}
              options={teams.map((item) => ({
                value: item.id,
                label: item.name,
              }))}
              onValueChange={(id) =>
                void selectTeam(id).catch((reason: unknown) =>
                  toast.error('Could not switch teams', {
                    description:
                      reason instanceof Error ? reason.message : String(reason),
                  }),
                )
              }
            />
          }
        />
        <SettingsRow
          title="Name"
          description={
            canManage
              ? 'How the team shows in the rail and to its members.'
              : 'Owners and admins can rename the team.'
          }
          control={
            <form className="flex items-center gap-2" onSubmit={rename}>
              <Input
                size="sm"
                aria-label="Team name"
                className="w-52"
                required
                maxLength={80}
                disabled={!canManage || !team}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              {canManage ? (
                <Button
                  size="sm"
                  type="submit"
                  disabled={
                    saving || !name.trim() || name.trim() === team?.name
                  }
                >
                  Save
                </Button>
              ) : null}
            </form>
          }
        />
        {team ? (
          <SettingsRow
            title="Address"
            description="Every document’s link starts with it."
            control={
              <code
                data-selectable=""
                className="truncate font-mono text-[13px] text-muted-foreground"
              >
                /{team.slug}/a/…
              </code>
            }
          />
        ) : null}
      </SettingsSection>
      {canCreateTeams ? (
        <SettingsSection title="Teams">
          <SettingsRow
            title="New team"
            description="With its own documents, members and agent keys."
            control={
              <Button size="sm" onClick={() => setNewTeamOpen(true)}>
                New team
              </Button>
            }
          />
        </SettingsSection>
      ) : null}
      <NewTeamDialog open={newTeamOpen} onOpenChange={setNewTeamOpen} />
    </SettingsPageContainer>
  )
}
