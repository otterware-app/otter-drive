import { useMemo } from 'react'
import {
  ArchiveIcon,
  ArrowLeftIcon,
  ClockIcon,
  FolderPlusIcon,
  PlusIcon,
  SearchIcon,
  UploadIcon,
  UsersIcon,
} from 'lucide-react'
import type { Artifact } from '@otterware/contracts'
import { IconButton } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/menu'
import { HintTooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { shortcutLabel } from '../keybindings/commands'
import {
  SIDEBAR_ROW,
  SidebarHeading,
  SidebarRow,
  SidebarSection,
} from '../sidebar-ui'
import { driveForFolder, folderLabel, type Folder } from '../folders'
import {
  DOCUMENT_KINDS,
  KIND_META,
  documentKind,
  inView,
  type DriveSearch,
} from './documents'
import { shareFolder } from './folder-menu'
import { FolderTree } from './folder-tree'

/**
 * The sidebar (Otter Mail's mailbox page, with Google Drive's places): the
 * drive's name, New (a folder or an upload) and Search, then its folders as
 * a tree and the open folder's views and kinds. "Shared with me", and the
 * folders in it, get their own.
 */
export function DriveSidebar({
  folder,
  folders,
  sharedView,
  sharedDocuments,
  documents,
  search,
  onOpenFolder,
  onOpenShared,
  onNavigate,
  onUpload,
  onNewFolder,
  onSearch,
}: {
  /** The open folder; null in "Shared with me". */
  folder: Folder | null
  folders: Folder[]
  /** "Shared with me" is showing. */
  sharedView: boolean
  /** The documents shared with you, for its counts. */
  sharedDocuments: Artifact[]
  /** The open folder's active documents, for the counts. */
  documents: Artifact[]
  search: DriveSearch
  onOpenFolder: (folder: Folder) => void
  onOpenShared: () => void
  /** Shows a view or kind in the list (and closes an open document). */
  onNavigate: (search: Pick<DriveSearch, 'view' | 'kind'>) => void
  onUpload: () => void
  onNewFolder: () => void
  onSearch: () => void
}) {
  const top = sharedView ? null : driveForFolder(folders, folder)
  // Inside a folder shared with you: its top is a folder, not a drive.
  const inShared = Boolean(top?.parentId)
  const drive = top && !inShared ? top : null
  const counted = sharedView ? sharedDocuments : documents
  const counts = useMemo(() => {
    const now = Date.now()
    const byKind = new Map<string, number>()
    for (const artifact of counted) {
      if (artifact.archivedAt) continue
      const kind = documentKind(artifact)
      byKind.set(kind, (byKind.get(kind) ?? 0) + 1)
    }
    return {
      recent: counted.filter((artifact) => inView(artifact, 'recent', now))
        .length,
      byKind,
    }
  }, [counted])
  const view = search.view ?? 'all'
  const kinds = DOCUMENT_KINDS.filter((kind) => counts.byKind.get(kind))
  const canAdd = Boolean(folder) && folder?.role !== 'viewer' && !sharedView

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div aria-hidden className="h-(--workspace-topbar-height) shrink-0" />
      <SidebarHeading
        action={
          drive?.kind === 'shared' ? (
            <HintTooltip
              label={drive.role === 'owner' ? 'Manage members' : 'Members'}
              side="bottom"
            >
              <IconButton
                label={
                  drive.role === 'owner'
                    ? `Manage members of ${drive.name}`
                    : `Members of ${drive.name}`
                }
                onClick={() => shareFolder(drive)}
              >
                <UsersIcon className="size-4" />
              </IconButton>
            </HintTooltip>
          ) : null
        }
      >
        {sharedView || inShared
          ? 'Shared with me'
          : drive
            ? folderLabel(drive)
            : ' '}
      </SidebarHeading>

      <div className="flex shrink-0 flex-col gap-0.5 px-(--sidebar-content-inset)">
        {sharedView ? null : (
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={!canAdd}
              render={
                <button
                  type="button"
                  className={cn(
                    SIDEBAR_ROW,
                    'bg-sidebar-control-surface px-(--sidebar-row-content-inset) text-sidebar-foreground hover:bg-sidebar-row-hover disabled:opacity-64 data-popup-open:bg-sidebar-row-hover',
                  )}
                />
              }
            >
              <PlusIcon className="text-sidebar-muted-foreground group-hover:text-sidebar-foreground" />
              <span className="truncate">New</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="min-w-56">
              <DropdownMenuItem icon={<FolderPlusIcon />} onClick={onNewFolder}>
                New folder
              </DropdownMenuItem>
              <DropdownMenuItem
                icon={<UploadIcon />}
                accelerator={shortcutLabel('document.upload')}
                onClick={onUpload}
              >
                Upload files or a folder
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
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
        aria-label="Folders and views"
        className="scroll-fade-y min-h-0 flex-1 overflow-y-auto px-(--sidebar-content-inset) pt-3 pb-8"
      >
        {sharedView ? (
          <div className="flex flex-col gap-0.5">
            <SidebarRow
              icon={<UsersIcon />}
              title="Everything shared"
              selected={!search.kind}
              onClick={() => onNavigate({ view: 'shared', kind: undefined })}
            />
          </div>
        ) : (
          <>
            {inShared ? (
              <div className="mb-1 flex flex-col">
                <SidebarRow
                  icon={<ArrowLeftIcon />}
                  title="Shared with me"
                  onClick={onOpenShared}
                />
              </div>
            ) : null}
            {top ? (
              <FolderTree
                folders={folders}
                root={top}
                currentId={
                  view === 'all' && !search.kind ? (folder?.id ?? null) : null
                }
                onOpen={onOpenFolder}
                onDeleted={(deleted) => {
                  const parent = folders.find(
                    (item) => item.id === deleted.parentId,
                  )
                  if (parent && deleted.id === folder?.id) onOpenFolder(parent)
                }}
              />
            ) : null}
            <div className="mt-4 flex flex-col gap-0.5">
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
                onClick={() =>
                  onNavigate({ view: 'archived', kind: undefined })
                }
              />
            </div>
          </>
        )}
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
                  selected={
                    search.kind === kind &&
                    (sharedView ? view === 'shared' : view === 'all')
                  }
                  onClick={() =>
                    onNavigate({
                      view: sharedView ? 'shared' : undefined,
                      kind,
                    })
                  }
                />
              )
            })}
          </SidebarSection>
        ) : null}
      </nav>
    </div>
  )
}
