import { useState, type ComponentType } from 'react'
import {
  ArrowLeftIcon,
  BotIcon,
  CircleUserRoundIcon,
  HardDriveIcon,
  PaletteIcon,
  PlusIcon,
  Settings2Icon,
  UsersIcon,
} from 'lucide-react'
import { FolderMark } from '../drive/folder-mark'
import { useCanCreateFolders } from '../drive/folder-rail'
import { NewFolderDialog } from '../drive/new-folder-dialog'
import { folderLabel, type Folder } from '../folders'
import { SidebarHeading, SidebarRow } from '../sidebar-ui'
import { useSettingsDrive } from './drive-scope'

/**
 * Settings: yours (who you are, how Drive looks, your agents), then each of
 * your drives with its own pages (its name, members and storage).
 */
export const ACCOUNT_PANES = ['account', 'appearance', 'agents'] as const
export const DRIVE_PANES = ['drive', 'members', 'storage'] as const
export type SettingsPane =
  (typeof ACCOUNT_PANES)[number] | (typeof DRIVE_PANES)[number]
export const SETTINGS_PANES: readonly SettingsPane[] = [
  ...ACCOUNT_PANES,
  ...DRIVE_PANES,
]

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

/** The pages a drive has for you: all of them for one you own (Members only
 *  for a shared drive), its General page otherwise. */
export function drivePanes(drive: Folder): readonly SettingsPane[] {
  if (drive.role !== 'owner') return ['drive']
  return drive.kind === 'shared' ? DRIVE_PANES : ['drive', 'storage']
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

function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="flex h-7 min-w-0 items-center gap-2 px-(--sidebar-row-content-inset) text-[13px] text-sidebar-muted-foreground">
      {children}
    </h3>
  )
}

/**
 * The sidebar while Settings is open (Otter Mail's): your settings, then
 * each drive's, then Back to the documents. A drive's page opens that drive.
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
  const { drives, drive: current, selectDrive } = useSettingsDrive()
  const canCreate = useCanCreateFolders()
  const [creating, setCreating] = useState(false)
  const selected = settingsPane(pane)
  const accountPane = (ACCOUNT_PANES as readonly string[]).includes(
    selected ?? '',
  )
  return (
    <div className="flex h-full min-w-0 flex-col">
      <SidebarHeading>Settings</SidebarHeading>
      <nav
        aria-label="Settings"
        className="scroll-fade-y flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-(--sidebar-content-inset) pt-1 pb-8"
      >
        <div className="flex flex-col gap-0.5">
          <GroupHeading>Account</GroupHeading>
          {ACCOUNT_PANES.map((id) => {
            const { label, icon: Icon } = SETTINGS_PANE_META[id]
            return (
              <SidebarRow
                key={id}
                icon={<Icon />}
                title={label}
                selected={id === selected}
                onClick={() => onSelect(id)}
              />
            )
          })}
        </div>
        {drives.map((drive) => (
          <div
            key={drive.id}
            role="group"
            aria-label={folderLabel(drive)}
            className="flex flex-col gap-0.5"
          >
            <GroupHeading>
              <FolderMark folder={drive} className="size-4 text-[7px]" />
              <span className="truncate">{folderLabel(drive)}</span>
            </GroupHeading>
            {drivePanes(drive).map((id) => {
              const { label, icon: Icon } = SETTINGS_PANE_META[id]
              return (
                <SidebarRow
                  key={id}
                  icon={<Icon />}
                  title={label}
                  selected={
                    !accountPane && id === selected && drive.id === current?.id
                  }
                  onClick={() => {
                    if (drive.id === current?.id) onSelect(id)
                    else void selectDrive(drive).then(() => onSelect(id))
                  }}
                />
              )
            })}
          </div>
        ))}
        {canCreate ? (
          <SidebarRow
            icon={<PlusIcon />}
            title="New shared drive"
            className="text-sidebar-muted-foreground"
            onClick={() => setCreating(true)}
          />
        ) : null}
      </nav>
      <div className="flex shrink-0 flex-col gap-0.5 px-(--sidebar-content-inset) pt-1 pb-(--sidebar-content-inset)">
        <SidebarRow icon={<ArrowLeftIcon />} title="Back" onClick={onBack} />
      </div>
      <NewFolderDialog
        kind="shared"
        open={creating}
        onOpenChange={setCreating}
      />
    </div>
  )
}
