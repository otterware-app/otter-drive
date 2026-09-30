import { useState } from 'react'
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import {
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  Users,
  LogOut,
  Plus,
  Search,
  Settings,
} from 'lucide-react'
import { authClient } from '#/lib/auth-client'
import { useHydrated } from '#/lib/session-cache'
import { useOrganizations } from '@/hooks/use-organizations'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ThemeMenu } from '@/components/theme-menu'
import { openCommandPalette } from '@/components/command-palette'
import { NewTeamDialog } from '@/components/new-team-dialog'

function signOut() {
  void authClient.signOut({
    fetchOptions: { onSuccess: () => location.assign('/login') },
  })
}

export function BrandLink() {
  return (
    <Link to="/home" className="topbar-brand" aria-label="Otter Drive home">
      <span className="brand-mark">
        <Box />
      </span>
      <strong>Otter Drive</strong>
    </Link>
  )
}

/**
 * The team crumb doubles as the team switcher. `current` overrides the
 * active team, so the viewer can show the document's team instead.
 */
export function TeamSwitcher({
  current,
}: {
  current?: { id: string; name: string } | undefined
}) {
  const { activeOrganization, organizations, selectOrganization } =
    useOrganizations()
  const navigate = useNavigate()
  const pathname = useLocation({ select: (location) => location.pathname })
  const [newTeamOpen, setNewTeamOpen] = useState(false)
  // Teams come from sessionStorage before the network answers, which the
  // server cannot see; hold them back until hydration is done.
  const hydrated = useHydrated()
  const team = hydrated ? (current ?? activeOrganization) : undefined

  async function openTeam(organizationId: string) {
    try {
      await selectOrganization(organizationId)
    } catch (reason) {
      toast.error(
        reason instanceof Error ? reason.message : 'Could not switch teams.',
      )
      return
    }
    if (pathname !== '/home') await navigate({ to: '/home' })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className="team-switcher"
              aria-label="Switch team"
            />
          }
        >
          <Users />
          <span>{team?.name ?? 'Team'}</span>
          <ChevronDown className="team-switcher-chevron" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="team-menu">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Teams</DropdownMenuLabel>
            {(hydrated ? organizations : []).map((organization) => {
              const active = organization.id === team?.id
              return (
                <DropdownMenuItem
                  key={organization.id}
                  aria-current={active ? 'true' : undefined}
                  onClick={() => void openTeam(organization.id)}
                >
                  <Users />
                  <span className="team-menu-name">{organization.name}</span>
                  {active && <Check className="menu-item-check" />}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setNewTeamOpen(true)}>
            <Plus /> New team
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <NewTeamDialog open={newTeamOpen} onOpenChange={setNewTeamOpen} />
    </>
  )
}

export function AccountMenu() {
  const session = authClient.useSession()
  const hydrated = useHydrated()
  const user = hydrated ? session.data?.user : undefined
  const initials = user?.name?.slice(0, 2).toUpperCase() ?? 'OT'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="account-button"
            aria-label="Open account menu"
          />
        }
      >
        {initials}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="user-menu">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="user-menu-identity">
            <strong>{user?.name}</strong>
            <small>{user?.email}</small>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem render={<Link to="/settings" />}>
            <Settings /> Settings
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <ThemeMenu />
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={signOut}>
            <LogOut /> Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AppHeader({ actions }: { actions?: React.ReactNode }) {
  const pathname = useLocation({ select: (location) => location.pathname })
  // Home is the team's documents, so only other pages need a crumb.
  const pageTitle = pathname.startsWith('/settings') ? 'Settings' : undefined

  return (
    <header className="app-header">
      <div className="app-header-start">
        <BrandLink />
        <nav className="app-breadcrumb" aria-label="Breadcrumb">
          <TeamSwitcher />
          {pageTitle && (
            <>
              <ChevronRight />
              <strong>{pageTitle}</strong>
            </>
          )}
        </nav>
      </div>
      <div className="app-header-actions">
        <Button
          variant="outline"
          size="sm"
          className="command-trigger"
          aria-label="Search everywhere"
          onClick={openCommandPalette}
        >
          <Search />
          <kbd>⌘K</kbd>
        </Button>
        {actions}
      </div>
      <div className="app-header-end">
        <AccountMenu />
      </div>
    </header>
  )
}
