import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  CircleUserRoundIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  PlusIcon,
  SettingsIcon,
  SunIcon,
  SunMoonIcon,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { authClient } from '#/lib/auth-client'
import {
  DropdownMenu,
  DropdownMenuCheckItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuTrigger,
} from '@/components/ui/menu'
import { HintTooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { shortcutLabel, type KeybindingCommand } from '../keybindings/commands'
import type { Folder } from '../folders'
import { NewFolderDialog } from './new-folder-dialog'
import { FolderMark, UserAvatar } from './folder-mark'

/** A rail button: a square that lights up on hover, and stays lit where you are. */
const RAIL_BUTTON =
  'relative flex size-9 shrink-0 items-center justify-center rounded-lg text-sidebar-muted-foreground outline-none transition-colors hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-focus-ring data-popup-open:bg-sidebar-row-hover'
const RAIL_BUTTON_SELECTED = 'bg-sidebar-row-selected text-sidebar-foreground'

export function signOut() {
  void authClient.signOut({
    fetchOptions: { onSuccess: () => location.assign('/login') },
  })
}

export function useCanCreateFolders(): boolean {
  return Boolean(authClient.useSession().data?.user)
}

/**
 * The rail down the window's left edge (Otter Mail's mailbox rail): your
 * folders, then who you are at the bottom, with the app's menu. It stays when
 * the sidebar hides, so switching folders never needs the sidebar.
 */
export function FolderRail({
  folders,
  currentFolderId,
  settingsOpen,
  onSelectFolder,
}: {
  folders: Folder[]
  /** The folder showing; none is lit while Settings is. */
  currentFolderId: string | null
  settingsOpen: boolean
  onSelectFolder: (folder: Folder) => void
}) {
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const canCreateFolders = useCanCreateFolders()

  return (
    <nav
      aria-label="Drives"
      data-app-sidebar=""
      className="flex w-(--workspace-rail-width) shrink-0 flex-col items-center pb-(--sidebar-content-inset) text-sidebar-foreground"
    >
      {/* Under the title band (the pinned sidebar toggle sits over it), and
          past the panel's rounded corner: level with the sidebar's heading. */}
      <div
        aria-hidden
        className="h-(--workspace-topbar-height) w-full shrink-0"
      />
      <div className="mt-(--radius-xl) flex min-h-0 flex-col items-center gap-1 overflow-y-auto">
        {folders.map((folder, index) => {
          const selected = !settingsOpen && folder.id === currentFolderId
          return (
            <HintTooltip
              key={folder.id}
              label={folder.name}
              hint={
                index < 9
                  ? shortcutLabel(
                      `folder.jump.${index + 1}` as KeybindingCommand,
                    )
                  : undefined
              }
              side="right"
            >
              <button
                type="button"
                aria-label={folder.name}
                aria-current={selected ? 'page' : undefined}
                onClick={() => onSelectFolder(folder)}
                className={cn(RAIL_BUTTON, selected && RAIL_BUTTON_SELECTED)}
              >
                <FolderMark
                  folder={folder}
                  className="size-6 rounded-md text-[10px]"
                />
              </button>
            </HintTooltip>
          )
        })}
        {canCreateFolders ? (
          <HintTooltip label="New shared drive" side="right">
            <button
              type="button"
              aria-label="New shared drive"
              className={RAIL_BUTTON}
              onClick={() => setNewFolderOpen(true)}
            >
              <PlusIcon className="size-4.5" />
            </button>
          </HintTooltip>
        ) : null}
      </div>
      <span className="flex-1" />
      <AccountMenu active={settingsOpen} />
      <NewFolderDialog
        kind="shared"
        open={newFolderOpen}
        onOpenChange={setNewFolderOpen}
      />
    </nav>
  )
}

/** Light, dark, or the system's: a submenu in the app's menus. */
export function AppearanceSubmenu() {
  const { theme, setTheme } = useTheme()
  const options = [
    { value: 'system', label: 'System', icon: <MonitorIcon /> },
    { value: 'light', label: 'Light', icon: <SunIcon /> },
    { value: 'dark', label: 'Dark', icon: <MoonIcon /> },
  ]
  return (
    <DropdownMenuSub label="Appearance" icon={<SunMoonIcon />}>
      {options.map((option) => (
        <DropdownMenuCheckItem
          key={option.value}
          icon={option.icon}
          checked={(theme ?? 'system') === option.value}
          onClick={() => setTheme(option.value)}
        >
          {option.label}
        </DropdownMenuCheckItem>
      ))}
    </DropdownMenuSub>
  )
}

/**
 * The rail's foot: you, opening the app's menu (who you are, Settings,
 * Appearance, Sign out).
 */
function AccountMenu({ active }: { active: boolean }) {
  const session = authClient.useSession()
  const navigate = useNavigate()
  const user = session.data?.user
  return (
    <DropdownMenu>
      <HintTooltip
        label={user ? user.name || user.email : 'Account'}
        side="right"
      >
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label="Account and settings"
              className={cn(RAIL_BUTTON, active && RAIL_BUTTON_SELECTED)}
            />
          }
        >
          {user ? (
            <UserAvatar user={user} className="size-6" />
          ) : (
            <CircleUserRoundIcon className="size-5" />
          )}
        </DropdownMenuTrigger>
      </HintTooltip>
      <DropdownMenuContent side="right" align="end" className="min-w-56">
        {user ? (
          <DropdownMenuItem
            icon={<UserAvatar user={user} className="size-5" />}
            className="h-auto py-1.5"
            onClick={() =>
              void navigate({
                to: '/settings/$pane',
                params: { pane: 'account' },
              })
            }
          >
            <span className="block truncate text-foreground">
              {user.name || user.email}
            </span>
            {user.name ? (
              <span className="block truncate text-[13px] text-muted-foreground">
                {user.email}
              </span>
            ) : null}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          icon={<SettingsIcon />}
          onClick={() =>
            void navigate({
              to: '/settings/$pane',
              params: { pane: 'account' },
            })
          }
        >
          Settings
        </DropdownMenuItem>
        <AppearanceSubmenu />
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={<LogOutIcon />} onClick={signOut}>
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
