import { SlidersHorizontalIcon } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { AccountPane } from './account-pane'
import { AgentsPane } from './agents-pane'
import { AppearancePane } from './appearance-pane'
import { DrivePane } from './drive-pane'
import { MembersPane } from './members-pane'
import { settingsPane } from './settings-nav'
import { StoragePane } from './storage-pane'

/** The main pane while Settings is open: the pane the route names. */
export function SettingsPage({ pane }: { pane: string }) {
  switch (settingsPane(pane)) {
    case 'account':
      return <AccountPane />
    case 'appearance':
      return <AppearancePane />
    case 'agents':
      return <AgentsPane />
    case 'drive':
      return <DrivePane />
    case 'members':
      return <MembersPane />
    case 'storage':
      return <StoragePane />
    case null:
      return (
        <div className="flex h-full items-center justify-center">
          <EmptyState
            icon={SlidersHorizontalIcon}
            title="No such settings"
            description="Pick a section from the sidebar."
          />
        </div>
      )
  }
}
