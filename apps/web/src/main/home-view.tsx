import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useNavigate } from '@tanstack/react-router'
import type { Artifact, SharedItem } from '@otterware/contracts'
import { EmptyState } from '@/components/ui/empty-state'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { ArrowLeftIcon, UploadIcon, UsersIcon } from 'lucide-react'
import { IconButton } from '@/components/ui/button'
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/menu'
import { HintTooltip } from '@/components/ui/tooltip'
import { CommandPalette } from './drive/command-palette'
import { DeleteDocumentDialogHost } from './drive/delete-dialog'
import {
  Breadcrumbs,
  DocumentList,
  requestOpenSearch,
  type ListEntry,
} from './drive/document-list'
import {
  documentKind,
  inView,
  useDocumentActions,
  useDocuments,
  visibleDocuments,
  type DriveSearch,
} from './drive/documents'
import { DropOverlay, useDropUpload } from './drive/drop-upload'
import { FolderDialogsHost } from './drive/folder-dialogs'
import { FolderMenuItems } from './drive/folder-menu'
import { ListFilters, NewMenu } from './drive/list-filters'
import { NewFolderDialog, NewFolderDialogHost } from './drive/new-folder-dialog'
import { FolderRail, useCanCreateFolders } from './drive/folder-rail'
import { ShareDialogHost } from './drive/share-dialog'
import { UploadDialogHost, requestUpload } from './drive/upload-dialog'
import { useCommandHandlers } from './keybindings/dispatch'
import {
  PaneResizer,
  useIsNarrow,
  useStoredBoolean,
  useStoredWidth,
} from './panes'
import { SettingsNav } from './settings/settings-nav'
import { useFolderRole } from './folder-role'
import { shortcutLabel } from './keybindings/commands'
import { SidebarControl } from './top-bar'
import {
  driveForFolder,
  folderLabel,
  folderPath,
  isInSharedFolder,
  useFolders,
  useSharedWithMe,
  type Folder,
} from './folders'

/**
 * The window (Otter Mail's home-view.tsx): ChatGPT-style chrome where the
 * frame wears the sidebar's surface, the rail of drives runs down its left
 * edge, and the columns after it share one inset panel with rounded
 * corners: the list (or, in Settings, its sections) and the main pane (the
 * overview, a document, or a Settings pane) that the routes fill.
 *
 * The list is the way around, like a file manager: the open folder
 * (`?folder=` in the URL, so Back walks folders) with its folders first,
 * breadcrumbs and Up above them, and filter chips for kinds, this week and
 * the archive. "Shared with me" (`?view=shared`) lists the folders and
 * documents other people shared with you, Google Drive's way.
 */

export type Place =
  | { kind: 'home' }
  | { kind: 'document'; folderSlug: string; slug: string }
  | { kind: 'settings'; pane: string }

interface DriveContextValue {
  /** The folder showing: the open document's, else the open one. */
  folder: Folder | null
  folders: Folder[]
  /** Your folders are known. */
  foldersLoaded: boolean
  /** Folders are known and there are none. */
  noFolder: boolean
  /** The folder's active documents (the overview's and the counts'). */
  documents: Artifact[]
  documentsLoading: boolean
  /** "Shared with me" is showing. */
  sharedView: boolean
  /** What other people shared with you, archived documents included. */
  sharedItems: SharedItem[]
  /** What Shared with me lists. */
  sharedListed: SharedItem[]
  sharedLoading: boolean
  openFolder: (folder: Folder) => void
  openShared: () => void
  narrow: boolean
  /** The viewer has the window: the list hidden. */
  expanded: boolean
  toggleExpanded: () => void
  /** Nothing sits left of the main pane (its corner follows the panel's). */
  mainIsLeftmost: boolean
}

const DriveContext = createContext<DriveContextValue | null>(null)

export function useDrive(): DriveContextValue {
  const value = useContext(DriveContext)
  if (!value) throw new Error('useDrive() outside the drive window')
  return value
}

/** Settings' sections sit in the panel, between the frame's tone and the
    canvas, with a faint full-height divider before the pane. */
const PANE_SIDEBAR =
  'min-h-0 overflow-hidden relative text-sidebar-foreground before:pointer-events-none before:absolute before:bottom-px before:left-px before:right-0 before:top-[calc(var(--workspace-topbar-height)+1px)] before:-z-10 before:rounded-l-[calc(var(--radius-xl)-1px)] before:bg-(--sidebar-panel-surface) after:pointer-events-none after:absolute after:bottom-0 after:right-0 after:top-0 after:w-px after:bg-border/70'
/** A faint full-height divider on the list's right, through the title band. */
const PANE_LIST =
  'min-h-0 overflow-hidden relative after:pointer-events-none after:absolute after:bottom-0 after:right-0 after:top-0 after:w-px after:bg-border/70'
/** Clips a collapsible pane while its width animates open or closed. */
const PANE_FRAME =
  'flex min-h-0 shrink-0 overflow-hidden transition-[width] duration-200 ease-out'

function matches(needle: string, ...values: string[]) {
  return !needle || values.join(' ').toLowerCase().includes(needle)
}

export function DriveHome({
  place,
  search,
  onSearchChange,
  children,
}: {
  place: Place
  search: DriveSearch
  /** Changes the list's URL state (typing replaces, clicks push). */
  onSearchChange: (update: Partial<DriveSearch>, replace?: boolean) => void
  children: ReactNode
}) {
  const navigate = useNavigate()
  const narrow = useIsNarrow()
  const { activeFolder, loaded, folders, selectFolder } = useFolders()
  const shared = useSharedWithMe()
  const canCreateFolders = useCanCreateFolders()

  // The folder showing: the open document's (by its URL), else the open one.
  const routeFolder =
    place.kind === 'document'
      ? (folders.find((folder) => folder.slug === place.folderSlug) ?? null)
      : null
  // A document shared on its own lives in a folder you can't open: the list
  // shows what's shared with you instead.
  const sharedDocumentOpen = place.kind === 'document' && loaded && !routeFolder
  const sharedView = search.view === 'shared' || sharedDocumentOpen
  const folder = sharedView
    ? null
    : place.kind === 'document'
      ? routeFolder
      : activeFolder

  // The open folder follows the URL (links, Back), and the URL names the
  // open folder once it's known.
  useEffect(() => {
    if (!loaded || place.kind !== 'home' || search.view === 'shared') return
    if (search.folder && search.folder !== activeFolder?.id) {
      if (folders.some((item) => item.id === search.folder))
        void selectFolder(search.folder)
    } else if (!search.folder && activeFolder)
      onSearchChange({ folder: activeFolder.id }, true)
  }, [
    loaded,
    place.kind,
    search.view,
    search.folder,
    activeFolder,
    folders,
    selectFolder,
    onSearchChange,
  ])

  // A document opened from another folder (a link, the palette) makes that
  // folder the open one, so closing it, uploads and Settings follow it.
  const selecting = useRef<string | null>(null)
  useEffect(() => {
    if (!routeFolder || !activeFolder || routeFolder.id === activeFolder.id)
      return
    if (search.view === 'shared') return
    if (selecting.current === routeFolder.id) return
    selecting.current = routeFolder.id
    // A failure keeps the mark, so it isn't retried on every render.
    void selectFolder(routeFolder.id).then(
      () => {
        selecting.current = null
      },
      () => undefined,
    )
  }, [routeFolder, activeFolder, selectFolder, search.view])

  useFolderRole(folder?.id, Boolean(folder))
  const status = search.view === 'archived' ? 'archived' : 'active'
  const active = useDocuments(folder?.id, 'active')
  // The list's own source: the same query as `active` unless it's Archived.
  const listSource = useDocuments(folder?.id, status)
  const { put, removed } = useDocumentActions(folder?.id)

  // What the filter chips count.
  const sharedDocuments = useMemo(
    () =>
      shared.listed.flatMap((item) => (item.artifact ? [item.artifact] : [])),
    [shared.listed],
  )

  // The list: the folder's folders (Google Drive puts them first) and its
  // documents, or what's shared with you.
  const { entries, totalInView } = useMemo((): {
    entries: ListEntry[]
    totalInView: number
  } => {
    const needle = search.q?.trim().toLowerCase() ?? ''
    const byName = (left: string, right: string) =>
      search.sort === 'za'
        ? right.localeCompare(left)
        : left.localeCompare(right)
    if (sharedView) {
      const items = shared.listed.filter((item) =>
        item.type === 'folder'
          ? !search.kind && matches(needle, item.folder!.name)
          : (!search.kind || documentKind(item.artifact!) === search.kind) &&
            matches(
              needle,
              item.artifact!.title,
              item.artifact!.slug,
              item.artifact!.description,
            ),
      )
      const name = (item: SharedItem) =>
        item.folder?.name ?? item.artifact!.title
      items.sort((left, right) => {
        if (left.type !== right.type) return left.type === 'folder' ? -1 : 1
        if (search.sort === 'az' || search.sort === 'za')
          return byName(name(left), name(right))
        return right.sharedAt.localeCompare(left.sharedAt)
      })
      return {
        totalInView: shared.listed.length,
        entries: items.map((item): ListEntry => {
          const sharedBy = { person: item.sharedBy, at: item.sharedAt }
          if (item.type === 'folder')
            return { type: 'folder', folder: item.folder!, sharedBy }
          const artifact = item.artifact!
          // Through a folder you can open, or on its own, by id.
          const via = folders.find((entry) => entry.id === artifact.folderId)
          return {
            type: 'document',
            artifact,
            folderSlug: item.folderSlug,
            folderId: via?.id,
            sharedBy,
          }
        }),
      }
    }
    if (!folder) return { entries: [], totalInView: 0 }
    const view = search.view ?? 'all'
    const subfolders =
      view === 'all' && !search.kind
        ? folders
            .filter(
              (item) =>
                item.parentId === folder.id && matches(needle, item.name),
            )
            .sort((left, right) => byName(left.name, right.name))
        : []
    return {
      totalInView:
        listSource.documents.filter((artifact) => inView(artifact, view))
          .length + subfolders.length,
      entries: [
        ...subfolders.map((item): ListEntry => ({
          type: 'folder',
          folder: item,
        })),
        ...visibleDocuments(listSource.documents, search).map(
          (artifact): ListEntry => ({
            type: 'document',
            artifact,
            folderSlug: folder.slug,
            folderId: folder.id,
          }),
        ),
      ],
    }
  }, [sharedView, shared.listed, folder, folders, listSource.documents, search])

  // Layout: Settings' sections (a drawer on phones), the list, and the
  // viewer at full width.
  const [sidebarOpen, setSidebarOpen] = useStoredBoolean(
    'otterdrive:sidebar-open',
    true,
  )
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [expanded, setExpanded] = useStoredBoolean(
    'otterdrive:viewer-expanded',
    false,
  )
  const sidebarPane = useStoredWidth('otterdrive:sidebar-width', 244, 200, 360)
  const listPane = useStoredWidth('otterdrive:list-width', 360, 280, 560)
  const settingsOpen = place.kind === 'settings'
  const documentOpen = place.kind === 'document'
  const viewerExpanded = documentOpen && expanded && !narrow
  const showSidebar = settingsOpen && !narrow && sidebarOpen
  const showList =
    !settingsOpen && !viewerExpanded && (!narrow || !documentOpen)
  const showMain = !narrow || documentOpen || settingsOpen
  useEffect(() => {
    if (!narrow) setDrawerOpen(false)
  }, [narrow])

  // ⌘B: Settings' sections there; with a document open, the list.
  const toggleSidebar = () => {
    if (settingsOpen) {
      if (narrow) setDrawerOpen((open) => !open)
      else setSidebarOpen((open) => !open)
    } else if (documentOpen && !narrow) setExpanded((current) => !current)
    else return false
  }

  const [paletteOpen, setPaletteOpen] = useState(false)
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const goHome = (update: Partial<DriveSearch> = {}) =>
    void navigate({
      to: '/home',
      search: (current) => ({
        folder: current.folder,
        q: current.q,
        sort: current.sort,
        view: current.view,
        kind: current.kind,
        ...update,
      }),
    })

  const openFolder = (next: Folder) => {
    setDrawerOpen(false)
    void selectFolder(next.id).catch((reason: unknown) =>
      toast.error('Could not open the folder', {
        description: reason instanceof Error ? reason.message : String(reason),
      }),
    )
    // Leave an open document: its folder would otherwise stay the open one.
    goHome({ folder: next.id, view: undefined, kind: undefined, q: undefined })
  }

  const openShared = () => {
    setDrawerOpen(false)
    goHome({ folder: undefined, view: 'shared', kind: undefined, q: undefined })
  }

  const focusSearch = () => {
    if (!showList) {
      if (settingsOpen || narrow) goHome()
      else setExpanded(false)
    }
    setDrawerOpen(false)
    requestOpenSearch()
  }

  const drives = folders.filter((item) => !item.parentId)
  const inSharedFolder = isInSharedFolder(folders, folder)
  const view = search.view ?? 'all'
  // Up: the folder above, or "Shared with me" above a folder shared with you.
  const parentFolder = folder?.parentId
    ? (folders.find((item) => item.id === folder.parentId) ?? null)
    : null
  const goUp =
    sharedView || !folder || view !== 'all'
      ? null
      : parentFolder
        ? () => openFolder(parentFolder)
        : inSharedFolder
          ? openShared
          : null
  const canAdd = Boolean(folder) && folder?.role !== 'viewer' && !sharedView

  useCommandHandlers({
    'commandPalette.toggle': () => setPaletteOpen((open) => !open),
    'sidebar.toggle': toggleSidebar,
    'search.focus': () => focusSearch(),
    'document.upload': () => {
      if (!folder || folder.role === 'viewer') return false
      requestUpload()
    },
    'document.close': () => {
      if (!documentOpen) return false
      goHome()
    },
    'folder.up': () => {
      if (!goUp || !showList) return false
      goUp()
    },
    ...Object.fromEntries(
      drives
        .slice(0, 9)
        .map((item, index) => [
          `folder.jump.${index + 1}`,
          () => openFolder(item),
        ]),
    ),
  })

  const drop = useDropUpload(folder, put)

  const context: DriveContextValue = {
    folder,
    folders,
    foldersLoaded: loaded,
    noFolder: loaded && folders.length === 0,
    documents: active.documents,
    documentsLoading: active.loading,
    sharedView,
    sharedItems: shared.items,
    sharedListed: shared.listed,
    sharedLoading: shared.loading,
    openFolder,
    openShared,
    narrow,
    expanded: viewerExpanded,
    toggleExpanded: () => setExpanded((current) => !current),
    mainIsLeftmost: !showSidebar && !showList,
  }

  const heading = sharedView ? (
    <Breadcrumbs trail={[{ label: 'Shared with me' }]} />
  ) : folder ? (
    <Breadcrumbs
      trail={[
        ...(inSharedFolder
          ? [{ label: 'Shared with me', onClick: openShared }]
          : []),
        ...folderPath(folders, folder).map((item) => ({
          label: folderLabel(item),
          onClick: () => openFolder(item),
        })),
      ]}
      menu={
        <>
          {canAdd ? (
            <>
              <DropdownMenuItem
                icon={<UploadIcon />}
                accelerator={shortcutLabel('document.upload')}
                onClick={requestUpload}
              >
                Upload files or a folder
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          ) : null}
          <FolderMenuItems
            folder={folder}
            onDeleted={(deleted) => {
              const parent = folders.find(
                (item) => item.id === deleted.parentId,
              )
              if (parent) openFolder(parent)
            }}
          />
        </>
      }
    />
  ) : null

  const sidebarContent = settingsOpen ? (
    <SettingsNav
      pane={place.pane}
      onSelect={(pane) => {
        setDrawerOpen(false)
        void navigate({ to: '/settings/$pane', params: { pane } })
      }}
      onBack={() => goHome()}
    />
  ) : null

  return (
    <DriveContext value={context}>
      <div
        className="surface-grain flex h-dvh bg-sidebar-surface text-foreground"
        {...drop.handlers}
      >
        <FolderRail
          folders={drives}
          currentFolderId={driveForFolder(folders, folder)?.id ?? null}
          settingsOpen={settingsOpen}
          sharedOpen={sharedView || inSharedFolder}
          onSelectFolder={openFolder}
          onOpenShared={openShared}
        />
        {/* A thin margin of frame on every free side (ChatGPT), so the panel
            floats with all four corners rounded. */}
        <div className="relative isolate flex min-w-0 flex-1 pr-1 pb-1">
          {/* The inset content panel, behind the panes and under their
              title bands. */}
          <div
            aria-hidden
            className="pointer-events-none absolute top-(--workspace-topbar-height) right-1 bottom-1 left-0 -z-10 rounded-xl border border-(--panel-edge) bg-canvas"
          />
          <div
            style={{ width: showSidebar ? sidebarPane.width : 0 }}
            ref={sidebarPane.frameRef}
            className={cn(PANE_FRAME, !showSidebar && 'pointer-events-none')}
            inert={!showSidebar}
          >
            <div
              ref={sidebarPane.paneRef}
              style={{ width: sidebarPane.width }}
              className={cn(PANE_SIDEBAR, 'flex shrink-0 flex-col')}
              data-app-sidebar=""
            >
              {narrow ? null : sidebarContent}
            </div>
          </div>
          {showSidebar ? (
            <PaneResizer
              label="Resize sidebar"
              onPointerDown={sidebarPane.start}
            />
          ) : null}
          {showList ? (
            <>
              <div
                ref={listPane.paneRef}
                style={narrow ? undefined : { width: listPane.width }}
                className={cn(
                  PANE_LIST,
                  narrow ? 'min-w-0 flex-1' : 'shrink-0',
                )}
              >
                <DocumentList
                  entries={entries}
                  heading={heading}
                  headerLeading={
                    goUp ? (
                      <HintTooltip
                        label="Up"
                        hint={shortcutLabel('folder.up')}
                        side="bottom"
                      >
                        <IconButton
                          label="Up to the folder above"
                          className="-ms-1.5"
                          onClick={goUp}
                        >
                          <ArrowLeftIcon className="size-4" />
                        </IconButton>
                      </HintTooltip>
                    ) : null
                  }
                  actions={
                    sharedView ? null : (
                      <NewMenu
                        disabled={!canAdd}
                        onNewFolder={() => setNewFolderOpen(true)}
                        onUpload={requestUpload}
                      />
                    )
                  }
                  filters={
                    sharedView || folder ? (
                      <ListFilters
                        documents={
                          sharedView ? sharedDocuments : active.documents
                        }
                        search={search}
                        sharedView={sharedView}
                        onChange={(update) => onSearchChange(update)}
                      />
                    ) : null
                  }
                  searchPlaceholder={
                    sharedView
                      ? 'Search Shared with me'
                      : `Search ${folder ? folderLabel(folder) : 'documents'}`
                  }
                  totalInView={totalInView}
                  loading={
                    sharedView
                      ? shared.loading
                      : !context.noFolder && (!folder || listSource.loading)
                  }
                  error={sharedView ? shared.error : listSource.error}
                  search={search}
                  selectedSlug={documentOpen ? place.slug : null}
                  searchRef={searchRef}
                  emptyState={
                    sharedView && !search.q && !search.kind ? (
                      <EmptyState
                        className="h-full px-6"
                        icon={UsersIcon}
                        title="Nothing shared with you yet"
                        description="When someone shares a folder or a document with you, it shows up here."
                      />
                    ) : undefined
                  }
                  onOpenFolder={openFolder}
                  onSearchChange={(update) =>
                    onSearchChange(update, 'q' in update)
                  }
                />
              </div>
              {narrow ? null : (
                <PaneResizer
                  label="Resize list"
                  onPointerDown={listPane.start}
                />
              )}
            </>
          ) : null}
          {showMain ? (
            <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              {children}
            </main>
          ) : null}

          {narrow && drawerOpen ? (
            <>
              <div
                aria-hidden
                className="dialog-backdrop absolute inset-0 z-40"
                onPointerDown={() => setDrawerOpen(false)}
              />
              <div
                data-app-sidebar=""
                className="absolute top-0 bottom-1 left-0 z-50 flex w-[min(18rem,85vw)] flex-col rounded-r-xl bg-sidebar-surface shadow-[0_24px_64px_-24px_rgb(0_0_0/65%)] animate-[dialog-fade-in_140ms_ease-out]"
              >
                {sidebarContent}
              </div>
            </>
          ) : null}
          {drop.dragging ? <DropOverlay folder={folder} /> : null}
        </div>
      </div>

      {settingsOpen ? (
        <SidebarControl
          sidebarOpen={narrow ? drawerOpen : showSidebar}
          onToggleSidebar={toggleSidebar}
        />
      ) : null}
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        folders={folders}
        currentFolder={folder}
        canCreateFolders={canCreateFolders}
        onSelectFolder={openFolder}
        onOpenShared={openShared}
        onNewFolder={() => setNewFolderOpen(true)}
        onToggleSidebar={toggleSidebar}
      />
      <NewFolderDialog
        open={newFolderOpen}
        onOpenChange={setNewFolderOpen}
        parent={folder}
      />
      <NewFolderDialogHost />
      <FolderDialogsHost />
      <ShareDialogHost />
      <UploadDialogHost
        folder={folder}
        onUploaded={(uploaded) => {
          put(uploaded)
          if (folder)
            void navigate({
              to: '/$folderSlug/a/$slug',
              params: { folderSlug: folder.slug, slug: uploaded.slug },
            })
        }}
      />
      <DeleteDocumentDialogHost
        onDeleted={(artifact, folderId) => {
          if (folderId === folder?.id) removed(artifact)
          if (documentOpen && place.slug === artifact.slug) goHome()
        }}
      />
    </DriveContext>
  )
}
