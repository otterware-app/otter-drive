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
import type { Artifact } from '@otterware/contracts'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { CommandPalette } from './drive/command-palette'
import { DeleteDocumentDialogHost } from './drive/delete-dialog'
import { DocumentList, requestOpenSearch } from './drive/document-list'
import {
  inView,
  useDocumentActions,
  useDocuments,
  visibleDocuments,
  type DriveSearch,
} from './drive/documents'
import { DriveSidebar } from './drive/drive-sidebar'
import { DropOverlay, useDropUpload } from './drive/drop-upload'
import { NewFolderDialog } from './drive/new-folder-dialog'
import { FolderRail, useCanCreateFolders } from './drive/folder-rail'
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
import { SidebarControl } from './top-bar'
import { driveForFolder, useFolders, type Folder } from './folders'

/**
 * The window (Otter Mail's home-view.tsx): ChatGPT-style chrome where the
 * frame wears the sidebar's surface, the rail of folders runs down its left
 * edge, and the columns after it share one inset panel with rounded
 * corners: the sidebar (views, or Settings' sections), the list, and the
 * main pane (the overview, a document, or a Settings pane) that the routes
 * fill.
 */

export type Place =
  | { kind: 'home' }
  | { kind: 'document'; folderSlug: string; slug: string }
  | { kind: 'settings'; pane: string }

interface DriveContextValue {
  /** The folder showing: the open document's, else the active one. */
  folder: Folder | null
  folders: Folder[]
  /** Folders are known and there are none. */
  noFolder: boolean
  /** A document's folder isn't one of yours. */
  unknownFolderSlug: string | null
  /** The folder's active documents (the overview's and the counts'). */
  documents: Artifact[]
  documentsLoading: boolean
  narrow: boolean
  /** The viewer has the window: sidebar and list hidden. */
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

/** The sidebar's body sits in the panel, between the frame's tone and the
    canvas, with a faint full-height divider before the list. */
const PANE_SIDEBAR =
  'min-h-0 overflow-hidden relative text-sidebar-foreground before:pointer-events-none before:absolute before:bottom-px before:left-px before:right-0 before:top-[calc(var(--workspace-topbar-height)+1px)] before:-z-10 before:rounded-l-[calc(var(--radius-xl)-1px)] before:bg-(--sidebar-panel-surface) after:pointer-events-none after:absolute after:bottom-0 after:right-0 after:top-0 after:w-px after:bg-border/70'
/** A faint full-height divider on the list's right, through the title band. */
const PANE_LIST =
  'min-h-0 overflow-hidden relative after:pointer-events-none after:absolute after:bottom-0 after:right-0 after:top-0 after:w-px after:bg-border/70'
/** Clips a collapsible pane while its width animates open or closed. */
const PANE_FRAME =
  'flex min-h-0 shrink-0 overflow-hidden transition-[width] duration-200 ease-out'

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
  const canCreateFolders = useCanCreateFolders()

  // The folder showing: the open document's (by its URL), else the active one.
  const routeFolder =
    place.kind === 'document'
      ? (folders.find((folder) => folder.slug === place.folderSlug) ?? null)
      : null
  const folder = place.kind === 'document' ? routeFolder : activeFolder
  const unknownFolderSlug =
    place.kind === 'document' && loaded && !routeFolder
      ? place.folderSlug
      : null

  // A document opened from another folder (a link, the palette) makes that
  // folder the active one, so home, uploads and Settings follow it.
  const selecting = useRef<string | null>(null)
  useEffect(() => {
    if (!routeFolder || !activeFolder || routeFolder.id === activeFolder.id)
      return
    if (selecting.current === routeFolder.id) return
    selecting.current = routeFolder.id
    // A failure keeps the mark, so it isn't retried on every render.
    void selectFolder(routeFolder.id).then(
      () => {
        selecting.current = null
      },
      () => undefined,
    )
  }, [routeFolder, activeFolder, selectFolder])

  useFolderRole(folder?.id, Boolean(folder))
  const status = search.view === 'archived' ? 'archived' : 'active'
  const active = useDocuments(folder?.id, 'active')
  // The list's own source: the same query as `active` unless it's Archived.
  const listSource = useDocuments(folder?.id, status)
  const shown = useMemo(
    () => visibleDocuments(listSource.documents, search),
    [listSource.documents, search],
  )
  const totalInView = useMemo(() => {
    const view = search.view ?? 'all'
    return listSource.documents.filter((artifact) => inView(artifact, view))
      .length
  }, [listSource.documents, search.view])
  const { put, removed } = useDocumentActions(folder?.id)

  // Layout: the sidebar (a drawer on phones), the list, and full width.
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
  const showSidebar = !narrow && sidebarOpen && !viewerExpanded
  const showList =
    !settingsOpen && !viewerExpanded && (!narrow || !documentOpen)
  const showMain = !narrow || documentOpen || settingsOpen
  useEffect(() => {
    if (!narrow) setDrawerOpen(false)
  }, [narrow])

  const toggleSidebar = () => {
    if (narrow) setDrawerOpen((open) => !open)
    else if (viewerExpanded) {
      setExpanded(false)
      setSidebarOpen(true)
    } else setSidebarOpen((open) => !open)
  }

  const [paletteOpen, setPaletteOpen] = useState(false)
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const goHome = (update: Partial<DriveSearch> = {}) =>
    void navigate({
      to: '/home',
      search: (current) => ({
        q: current.q,
        sort: current.sort,
        view: current.view,
        kind: current.kind,
        ...update,
      }),
    })

  const openFolder = async (next: Folder) => {
    setDrawerOpen(false)
    // Leave the open document first: while its route names another folder,
    // the effect above would switch straight back to it.
    await navigate({ to: '/home', search: {} })
    try {
      await selectFolder(next.id)
    } catch (reason) {
      toast.error('Could not switch folders', {
        description: reason instanceof Error ? reason.message : String(reason),
      })
    }
  }

  const focusSearch = () => {
    if (!showList) {
      if (settingsOpen || narrow) goHome()
      else setExpanded(false)
    }
    setDrawerOpen(false)
    requestOpenSearch()
  }

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
    ...Object.fromEntries(
      folders
        .slice(0, 9)
        .map((item, index) => [
          `folder.jump.${index + 1}`,
          () => void openFolder(item),
        ]),
    ),
  })

  const drop = useDropUpload(folder, put)

  const context: DriveContextValue = {
    folder,
    folders,
    noFolder: loaded && folders.length === 0,
    unknownFolderSlug,
    documents: active.documents,
    documentsLoading: active.loading,
    narrow,
    expanded: viewerExpanded,
    toggleExpanded: () => setExpanded((current) => !current),
    mainIsLeftmost: !showSidebar && !showList,
  }

  const sidebarContent = settingsOpen ? (
    <SettingsNav
      pane={place.pane}
      onSelect={(pane) => {
        setDrawerOpen(false)
        void navigate({ to: '/settings/$pane', params: { pane } })
      }}
      onBack={() => goHome()}
    />
  ) : (
    <DriveSidebar
      folder={folder}
      folders={folders}
      onOpenFolder={(next) => void openFolder(next)}
      documents={active.documents}
      search={search}
      onNavigate={(update) => {
        setDrawerOpen(false)
        goHome({ ...update, q: undefined })
      }}
      onUpload={() => {
        setDrawerOpen(false)
        requestUpload()
      }}
      onSearch={focusSearch}
    />
  )

  return (
    <DriveContext value={context}>
      <div
        className="surface-grain flex h-dvh bg-sidebar-surface text-foreground"
        {...drop.handlers}
      >
        <FolderRail
          folders={folders.filter((item) => !item.parentId)}
          currentFolderId={driveForFolder(folders, folder)?.id ?? null}
          settingsOpen={settingsOpen}
          onSelectFolder={(next) => void openFolder(next)}
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
                  folder={folder}
                  documents={shown}
                  totalInView={totalInView}
                  loading={!context.noFolder && (!folder || listSource.loading)}
                  error={listSource.error}
                  search={search}
                  selectedSlug={documentOpen ? place.slug : null}
                  searchRef={searchRef}
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

      <SidebarControl
        sidebarOpen={narrow ? drawerOpen : showSidebar}
        onToggleSidebar={toggleSidebar}
      />
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        folders={folders}
        currentFolder={folder}
        canCreateFolders={canCreateFolders}
        onSelectFolder={(next) => void openFolder(next)}
        onNewFolder={() => setNewFolderOpen(true)}
        onToggleSidebar={toggleSidebar}
      />
      <NewFolderDialog open={newFolderOpen} onOpenChange={setNewFolderOpen} />
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
