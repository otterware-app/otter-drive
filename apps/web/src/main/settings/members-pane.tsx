import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { authClient } from '#/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RowSelect } from '@/components/ui/select'
import { toast } from '@/components/ui/toast'
import { UserAvatar } from '../drive/team-mark'
import { useTeamRole } from '../team-role'
import { useTeams } from '../teams'
import {
  CopyField,
  SettingsGroup,
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
  SettingsSectionHeader,
} from './settings-ui'

const ROLES = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'editor', label: 'Editor' },
  { value: 'admin', label: 'Admin' },
  { value: 'owner', label: 'Owner' },
]
const INVITE_ROLES = ROLES.filter((role) => role.value !== 'owner')
const ROLE_HELP: Record<string, string> = {
  viewer: 'Viewers read documents.',
  editor: 'Editors also upload, edit and archive.',
  admin: 'Admins also manage members and agent keys.',
}

type Member = {
  id: string
  role: string
  userId: string
  user: { name: string; email: string; image?: string | null }
}
type Invitation = { id: string; email: string; role: string; status: string }

function inviteLink(id: string) {
  return `${location.origin}/invite/${id}`
}

async function copy(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    toast.success('Copied')
  } catch {
    toast.error('Could not copy to the clipboard')
  }
}

export function MembersPane() {
  const { activeTeam: team } = useTeams()
  const session = authClient.useSession()
  const { canManage } = useTeamRole(team?.id, Boolean(team))
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('viewer')
  const [link, setLink] = useState<string | null>(null)
  const [inviting, setInviting] = useState(false)

  const members = useQuery({
    enabled: Boolean(team),
    queryKey: ['members', team?.id],
    queryFn: async () => {
      const result = await authClient.organization.listMembers({
        query: { organizationId: team!.id },
      })
      if (result.error) throw new Error(result.error.message)
      return (result.data?.members ?? []) as Member[]
    },
  })
  const invitations = useQuery({
    enabled: Boolean(team) && canManage,
    queryKey: ['invitations', team?.id],
    queryFn: async () => {
      const result = await authClient.organization.listInvitations({
        query: { organizationId: team!.id },
      })
      if (result.error) throw new Error(result.error.message)
      return ((result.data ?? []) as Invitation[]).filter(
        (item) => item.status === 'pending',
      )
    },
  })
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['members', team?.id] })
    void queryClient.invalidateQueries({ queryKey: ['invitations', team?.id] })
  }

  async function invite(event: React.FormEvent) {
    event.preventDefault()
    if (!team) return
    setInviting(true)
    const result = await authClient.organization.inviteMember({
      email,
      role: role as 'admin' | 'editor' | 'viewer',
      organizationId: team.id,
    })
    setInviting(false)
    if (result.error || !result.data) {
      toast.error('Could not invite', { description: result.error?.message })
      return
    }
    setLink(inviteLink(result.data.id))
    setEmail('')
    toast.success(`Invited ${result.data.email}`)
    refresh()
  }

  async function changeRole(member: Member, next: string) {
    const result = await authClient.organization.updateMemberRole({
      memberId: member.id,
      role: next as 'owner' | 'admin' | 'editor' | 'viewer',
      organizationId: team!.id,
    })
    if (result.error)
      toast.error('Could not change the role', {
        description: result.error.message,
      })
    refresh()
  }

  async function remove(member: Member) {
    const result = await authClient.organization.removeMember({
      memberIdOrEmail: member.id,
      organizationId: team!.id,
    })
    if (result.error) {
      toast.error('Could not remove the member', {
        description: result.error.message,
      })
      return
    }
    toast.success(`Removed ${member.user.name || member.user.email}`)
    refresh()
  }

  async function cancel(invitation: Invitation) {
    const result = await authClient.organization.cancelInvitation({
      invitationId: invitation.id,
    })
    if (result.error)
      toast.error('Could not cancel the invitation', {
        description: result.error.message,
      })
    refresh()
  }

  return (
    <SettingsPageContainer
      title="Members"
      description={
        team
          ? `Who can open ${team.name}’s documents.`
          : 'Who can open documents.'
      }
    >
      {canManage ? (
        <SettingsSection
          title="Invite"
          description="Otter Drive is invitation-only: the invitation is the way in."
        >
          <SettingsRow
            title="Email address"
            description={ROLE_HELP[role]}
            control={
              <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={invite}
              >
                <Input
                  size="sm"
                  type="email"
                  required
                  aria-label="Email address"
                  placeholder="colleague@example.com"
                  className="w-56"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
                <RowSelect
                  ariaLabel="Role"
                  value={role}
                  options={INVITE_ROLES}
                  onValueChange={setRole}
                />
                <Button
                  size="sm"
                  variant="accent"
                  type="submit"
                  disabled={inviting || !email}
                >
                  Invite
                </Button>
              </form>
            }
          >
            {link ? (
              <>
                <p className="mt-3 text-[13px] text-muted-foreground">
                  Send them this link, or let the email do it.
                </p>
                <CopyField value={link} onCopy={() => void copy(link)} />
              </>
            ) : null}
          </SettingsRow>
        </SettingsSection>
      ) : null}

      <section>
        <SettingsSectionHeader
          title="Members"
          description={
            members.data
              ? `${members.data.length} ${members.data.length === 1 ? 'person' : 'people'}`
              : undefined
          }
        />
        <SettingsGroup>
          {members.isPending ? (
            <div className="px-4 py-4 text-sm text-muted-foreground">
              Loading…
            </div>
          ) : members.error ? (
            <div className="px-4 py-4 text-sm text-destructive-foreground">
              {members.error.message}
            </div>
          ) : (
            (members.data ?? []).map((member) => {
              const you = member.userId === session.data?.user.id
              return (
                <div
                  key={member.id}
                  className="flex items-center gap-3 px-4 py-2.5"
                >
                  <UserAvatar user={member.user} className="size-8 text-xs" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-foreground">
                      {member.user.name || member.user.email}
                      {you ? (
                        <span className="text-muted-foreground"> (you)</span>
                      ) : null}
                    </div>
                    <div className="truncate text-[13px] text-muted-foreground">
                      {member.user.email}
                    </div>
                  </div>
                  {canManage && !you ? (
                    <>
                      <RowSelect
                        ariaLabel={`Role of ${member.user.email}`}
                        value={member.role}
                        options={ROLES}
                        onValueChange={(next) => void changeRole(member, next)}
                      />
                      <Button
                        size="sm"
                        variant="ghost-destructive"
                        onClick={() => void remove(member)}
                      >
                        Remove
                      </Button>
                    </>
                  ) : (
                    <span className="text-[13px] text-muted-foreground capitalize">
                      {member.role}
                    </span>
                  )}
                </div>
              )
            })
          )}
        </SettingsGroup>
      </section>

      {canManage && invitations.data && invitations.data.length > 0 ? (
        <SettingsSection title="Pending invitations">
          {invitations.data.map((invitation) => (
            <SettingsRow
              key={invitation.id}
              title={invitation.email}
              description={`Invited as ${invitation.role}`}
              control={
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void copy(inviteLink(invitation.id))}
                  >
                    Copy link
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost-destructive"
                    onClick={() => void cancel(invitation)}
                  >
                    Cancel
                  </Button>
                </>
              }
            />
          ))}
        </SettingsSection>
      ) : null}
    </SettingsPageContainer>
  )
}
