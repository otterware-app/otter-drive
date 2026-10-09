import type { ComponentType } from 'react'
import {
  ArrowLeftIcon,
  BotIcon,
  CircleUserRoundIcon,
  HardDriveIcon,
  PaletteIcon,
  Settings2Icon,
  UsersIcon,
} from 'lucide-react'
import { folderLabel } from '../folders'
import { SidebarHeading, SidebarRow } from '../sidebar-ui'
import { useSettingsDrive } from './drive-scope'

/**
 * Settings in two groups: yours (who you are, how Drive looks, your agents),
 * and the drive's (its name, members and storage), for the drive picked at
 * the top of its pages.
 */
export const SETTINGS_GROUPS = [
  {
    id: 'account',
    label: 'Account',
    panes: ['account', 'appearance', 'agents'],
  },
  { id: 'drive', label: 'Drive', panes: ['drive', 'members', 'storage'] },
] as const
export type SettingsPane = (typeof SETTINGS_GROUPS)[number]['panes'][number]
export const SETTINGS_PANES: readonly SettingsPane[] = SETTINGS_GROUPS.flatMap(
  (group) => group.panes,
)

export const SETTINGS_PANE_META: Record<
  SettingsPane,
  { label: string; icon: ComponentType<{ className?: string }> }
> = {
  account: { label: 'Account', icon: CircleUserRoundIcon },
  appearance: { label: 'Appearance', icon: PaletteIcon },
  agents: { label: 'Agents and API keys', icon: BotIcon },
  drive: { label: 'General', icon: Settings2Icon },
  members: { label: 'Members', icon: UsersIcon },
  storage: { label: 'Storage', icon: HardDriveIcon },
}

/** Older links: "folder" was the drive's page. */
export function settingsPane(value: string): SettingsPane | null {
  if (value === 'folder') return 'drive'
  return (SETTINGS_PANES as readonly string[]).includes(value)
    ? (value as SettingsPane)
    : null
}

export function isSettingsPane(value: string): value is SettingsPane {
  return settingsPane(value) === value
}

/**
 * The sidebar while Settings is open (Otter Mail's): your settings, then the
 * open drive's, then Back to the documents.
 */
export function SettingsNav({
  pane,
  onSelect,
  onBack,
}: {
  pane: string
  onSelect: (pane: SettingsPane) => void
  onBack: () => void
}) {
  const { drive } = useSettingsDrive()
  const current = settingsPane(pane)
  return (
    <div className="flex h-full min-w-0 flex-col">
      <SidebarHeading>Settings</SidebarHeading>
      <nav
        aria-label="Settings"
        className="scroll-fade-y flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-(--sidebar-content-inset) pt-1 pb-8"
      >
        {SETTINGS_GROUPS.map((group) => (
          <div key={group.id} className="flex flex-col gap-0.5">
            <h3 className="flex h-7 items-center gap-1 px-(--sidebar-row-content-inset) text-[13px] text-sidebar-muted-foreground">
              <span className="shrink-0">{group.label}</span>
              {group.id === 'drive' && drive ? (
                <span className="truncate text-sidebar-muted-foreground/70">
                  · {folderLabel(drive)}
                </span>
              ) : null}
            </h3>
            {group.panes.map((id) => {
              const { label, icon: Icon } = SETTINGS_PANE_META[id]
              return (
                <SidebarRow
                  key={id}
                  icon={<Icon />}
                  title={label}
                  selected={id === current}
                  onClick={() => onSelect(id)}
                />
              )
            })}
          </div>
        ))}
      </nav>
      <div className="flex shrink-0 flex-col gap-0.5 px-(--sidebar-content-inset) pt-1 pb-(--sidebar-content-inset)">
        <SidebarRow icon={<ArrowLeftIcon />} title="Back" onClick={onBack} />
      </div>
    </div>
  )
}
