import type { ComponentType } from 'react'
import {
  ArrowLeftIcon,
  BotIcon,
  CircleUserRoundIcon,
  PaletteIcon,
  Settings2Icon,
  UsersIcon,
} from 'lucide-react'
import { SidebarHeading, SidebarRow } from '../sidebar-ui'

export const SETTINGS_PANES = [
  'team',
  'members',
  'agents',
  'appearance',
  'account',
] as const
export type SettingsPane = (typeof SETTINGS_PANES)[number]

export const SETTINGS_PANE_META: Record<
  SettingsPane,
  { label: string; icon: ComponentType<{ className?: string }> }
> = {
  team: { label: 'Team', icon: Settings2Icon },
  members: { label: 'Members', icon: UsersIcon },
  agents: { label: 'Agents', icon: BotIcon },
  appearance: { label: 'Appearance', icon: PaletteIcon },
  account: { label: 'Account', icon: CircleUserRoundIcon },
}

export function isSettingsPane(value: string): value is SettingsPane {
  return (SETTINGS_PANES as readonly string[]).includes(value)
}

/**
 * The sidebar while Settings is open (Otter Mail's): the sections, then Back
 * to the documents.
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
  return (
    <div className="flex h-full min-w-0 flex-col">
      <div aria-hidden className="h-(--workspace-topbar-height) shrink-0" />
      <SidebarHeading>Settings</SidebarHeading>
      <nav
        aria-label="Settings"
        className="scroll-fade-y flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-(--sidebar-content-inset) pb-8"
      >
        {SETTINGS_PANES.map((id) => {
          const { label, icon: Icon } = SETTINGS_PANE_META[id]
          return (
            <SidebarRow
              key={id}
              icon={<Icon />}
              title={label}
              selected={id === pane}
              onClick={() => onSelect(id)}
            />
          )
        })}
      </nav>
      <div className="flex shrink-0 flex-col gap-0.5 px-(--sidebar-content-inset) pt-1 pb-(--sidebar-content-inset)">
        <SidebarRow icon={<ArrowLeftIcon />} title="Back" onClick={onBack} />
      </div>
    </div>
  )
}
