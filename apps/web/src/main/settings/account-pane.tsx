import { authClient } from '#/lib/auth-client'
import { Button } from '@/components/ui/button'
import { UserAvatar } from '../drive/folder-mark'
import { signOut } from '../drive/folder-rail'
import {
  SettingsGroup,
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from './settings-ui'

export function AccountPane() {
  const session = authClient.useSession()
  const user = session.data?.user
  return (
    <SettingsPageContainer
      title="Account"
      description="Who you are in Otter Drive."
    >
      {user ? (
        <SettingsGroup>
          <div className="flex items-center gap-3 px-4 py-3.5">
            <UserAvatar user={user} className="size-10 text-sm" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-foreground">
                {user.name || user.email}
              </div>
              <div className="truncate text-[13px] text-muted-foreground">
                {user.email}
              </div>
            </div>
          </div>
        </SettingsGroup>
      ) : null}
      <SettingsSection title="Security">
        <SettingsRow
          title="Otter account"
          description="Your Google sign-in is shared with Otter Mail."
          control={
            <Button
              size="sm"
              onClick={() => location.assign('/api/identity/account')}
            >
              Manage account
            </Button>
          }
        />
        <SettingsRow
          title="Sign out"
          description="On this browser. Your agents stay signed in."
          control={
            <Button size="sm" onClick={signOut}>
              Sign out
            </Button>
          }
        />
      </SettingsSection>
    </SettingsPageContainer>
  )
}
