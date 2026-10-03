import { SlidersHorizontalIcon } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { AccountPane } from './account-pane'
import { AgentsPane } from './agents-pane'
import { AppearancePane } from './appearance-pane'
import { MembersPane } from './members-pane'
import { isSettingsPane } from './settings-nav'
import { FolderPane } from './folder-pane'

/** The main pane while Settings is open: the pane the route names. */
export function SettingsPage({ pane }: { pane: string }) {
  if (!isSettingsPane(pane))
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          icon={SlidersHorizontalIcon}
          title="No such settings"
          description="Pick a section from the sidebar."
        />
      </div>
    )
  switch (pane) {
    case 'folder':
      return <FolderPane />
    case 'members':
      return <MembersPane />
    case 'agents':
      return <AgentsPane />
    case 'appearance':
      return <AppearancePane />
    case 'account':
      return <AccountPane />
  }
}
