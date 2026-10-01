import { useMemo } from 'react'
import {
  ArchiveIcon,
  ClockIcon,
  FilesIcon,
  SearchIcon,
  UploadIcon,
} from 'lucide-react'
import type { Artifact } from '@otterware/contracts'
import { HintTooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { shortcutLabel } from '../keybindings/commands'
import {
  SIDEBAR_ROW,
  SidebarHeading,
  SidebarRow,
  SidebarSection,
} from '../sidebar-ui'
import type { Team } from '../teams'
import {
  DOCUMENT_KINDS,
  KIND_META,
  documentKind,
  inView,
  type DriveSearch,
} from './documents'

/**
 * The team's sidebar (Otter Mail's mailbox page): its name, Upload (Otter
 * Mail's "New message"), Search, then the views and the kinds of document
 * the team has.
 */
export function DriveSidebar({
  team,
  documents,
  search,
  onNavigate,
  onUpload,
  onSearch,
}: {
  team: Team | null
  /** The team's active documents, for the counts. */
  documents: Artifact[]
  search: DriveSearch
  /** Shows a view or kind in the list (and closes an open document). */
  onNavigate: (search: Pick<DriveSearch, 'view' | 'kind'>) => void
  onUpload: () => void
  onSearch: () => void
}) {
  const counts = useMemo(() => {
    const now = Date.now()
    const byKind = new Map<string, number>()
    for (const artifact of documents) {
      if (artifact.archivedAt) continue
      const kind = documentKind(artifact)
      byKind.set(kind, (byKind.get(kind) ?? 0) + 1)
    }
    return {
      all: documents.filter((artifact) => inView(artifact, 'all', now)).length,
      recent: documents.filter((artifact) => inView(artifact, 'recent', now))
        .length,
      byKind,
    }
  }, [documents])
  const view = search.view ?? 'all'
  const kinds = DOCUMENT_KINDS.filter((kind) => counts.byKind.get(kind))

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div aria-hidden className="h-(--workspace-topbar-height) shrink-0" />
      <SidebarHeading>{team?.name ?? ' '}</SidebarHeading>

      <div className="flex shrink-0 flex-col gap-0.5 px-(--sidebar-content-inset)">
        <HintTooltip label="Upload" hint={shortcutLabel('document.upload')}>
          <button
            type="button"
            onClick={onUpload}
            disabled={!team}
            className={cn(
              SIDEBAR_ROW,
              'bg-sidebar-control-surface px-(--sidebar-row-content-inset) text-sidebar-foreground hover:bg-sidebar-row-hover disabled:opacity-64',
            )}
          >
            <UploadIcon className="text-sidebar-muted-foreground group-hover:text-sidebar-foreground" />
            <span className="truncate">Upload</span>
          </button>
        </HintTooltip>
        <SidebarRow
          icon={<SearchIcon />}
          title="Search"
          selected={Boolean(search.q)}
          trailing={
            <span className="ml-auto text-xs text-sidebar-muted-foreground/70 opacity-0 group-hover:opacity-100">
              {shortcutLabel('search.focus')}
            </span>
          }
          onClick={onSearch}
        />
      </div>

      <nav
        aria-label="Views"
        className="scroll-fade-y min-h-0 flex-1 overflow-y-auto px-(--sidebar-content-inset) pt-3 pb-8"
      >
        <div className="flex flex-col gap-0.5">
          <SidebarRow
            icon={<FilesIcon />}
            title="All documents"
            count={counts.all}
            selected={view === 'all' && !search.kind}
            onClick={() => onNavigate({ view: undefined, kind: undefined })}
          />
          <SidebarRow
            icon={<ClockIcon />}
            title="Updated this week"
            count={counts.recent}
            selected={view === 'recent' && !search.kind}
            onClick={() => onNavigate({ view: 'recent', kind: undefined })}
          />
          <SidebarRow
            icon={<ArchiveIcon />}
            title="Archived"
            selected={view === 'archived' && !search.kind}
            onClick={() => onNavigate({ view: 'archived', kind: undefined })}
          />
        </div>
        {kinds.length > 1 ? (
          <SidebarSection title="Kinds">
            {kinds.map((kind) => {
              const Icon = KIND_META[kind].icon
              return (
                <SidebarRow
                  key={kind}
                  icon={<Icon />}
                  title={KIND_META[kind].label}
                  count={counts.byKind.get(kind) ?? 0}
                  selected={search.kind === kind && view === 'all'}
                  onClick={() => onNavigate({ view: undefined, kind })}
                />
              )
            })}
          </SidebarSection>
        ) : null}
      </nav>
    </div>
  )
}
