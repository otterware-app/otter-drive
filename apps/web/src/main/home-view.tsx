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
import { NewTeamDialog } from './drive/new-team-dialog'
import { TeamRail, useCanCreateTeams } from './drive/team-rail'
import { UploadDialogHost, requestUpload } from './drive/upload-dialog'
import { useCommandHandlers } from './keybindings/dispatch'
import {
  PaneResizer,
  useIsNarrow,
  useStoredBoolean,
  useStoredWidth,
} from './panes'
import { SettingsNav } from './settings/settings-nav'
import { useTeamRole } from './team-role'
import { SidebarControl } from './top-bar'
import { useTeams, type Team } from './teams'

/**
 * The window (Otter Mail's home-view.tsx): ChatGPT-style chrome where the
 * frame wears the sidebar's surface, the rail of teams runs down its left
 * edge, and the columns after it share one inset panel with rounded
 * corners: the sidebar (views, or Settings' sections), the list, and the
 * main pane (the overview, a document, or a Settings pane) that the routes
 * fill.
 */

export type Place =
  | { kind: 'home' }
  | { kind: 'document'; teamSlug: string; slug: string }
  | { kind: 'settings'; pane: string }

interface DriveContextValue {
  /** The team showing: the open document's, else the active one. */
  team: Team | null
  teams: Team[]
  /** Teams are known and there are none. */
  noTeam: boolean
  /** A document's team isn't one of yours. */
  unknownTeamSlug: string | null
  /** The team's active documents (the overview's and the counts'). */
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
  const { activeTeam, loaded, teams, selectTeam } = useTeams()
  const canCreateTeams = useCanCreateTeams()

  // The team showing: the open document's (by its URL), else the active one.
  const routeTeam =
    place.kind === 'document'
      ? (teams.find((team) => team.slug === place.teamSlug) ?? null)
      : null
  const team = place.kind === 'document' ? routeTeam : activeTeam
  const unknownTeamSlug =
    place.kind === 'document' && loaded && !routeTeam ? place.teamSlug : null

  // A document opened from another team (a link, the palette) makes that
  // team the active one, so home, uploads and Settings follow it.
  const selecting = useRef<string | null>(null)
  useEffect(() => {
    if (!routeTeam || !activeTeam || routeTeam.id === activeTeam.id) return
    if (selecting.current === routeTeam.id) return
    selecting.current = routeTeam.id
    // A failure keeps the mark, so it isn't retried on every render.
    void selectTeam(routeTeam.id).then(
      () => {
        selecting.current = null
      },
      () => undefined,
    )
  }, [routeTeam, activeTeam, selectTeam])

  useTeamRole(team?.id, Boolean(team))
  const status = search.view === 'archived' ? 'archived' : 'active'
  const active = useDocuments(team?.id, 'active')
  // The list's own source: the same query as `active` unless it's Archived.
  const listSource = useDocuments(team?.id, status)
  const shown = useMemo(
    () => visibleDocuments(listSource.documents, search),
    [listSource.documents, search],
  )
  const totalInView = useMemo(() => {
    const view = search.view ?? 'all'
    return listSource.documents.filter((artifact) => inView(artifact, view))
      .length
  }, [listSource.documents, search.view])
  const { put, removed } = useDocumentActions(team?.id)

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
  const [newTeamOpen, setNewTeamOpen] = useState(false)
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

  const openTeam = async (next: Team) => {
    setDrawerOpen(false)
    // Leave the open document first: while its route names another team,
    // the effect above would switch straight back to it.
    await navigate({ to: '/home', search: {} })
    try {
      await selectTeam(next.id)
    } catch (reason) {
      toast.error('Could not switch teams', {
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
      if (!team) return false
      requestUpload()
    },
    'document.close': () => {
      if (!documentOpen) return false
      goHome()
    },
    ...Object.fromEntries(
      teams
        .slice(0, 9)
        .map((item, index) => [
          `team.jump.${index + 1}`,
          () => void openTeam(item),
        ]),
    ),
  })

  const drop = useDropUpload(team, put)

  const context: DriveContextValue = {
    team,
    teams,
    noTeam: loaded && teams.length === 0,
    unknownTeamSlug,
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
      team={team}
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
        <TeamRail
          teams={teams}
          currentTeamId={team?.id ?? null}
          settingsOpen={settingsOpen}
          onSelectTeam={(next) => void openTeam(next)}
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
                  team={team}
                  documents={shown}
                  totalInView={totalInView}
                  loading={!context.noTeam && (!team || listSource.loading)}
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
          {drop.dragging ? <DropOverlay team={team} /> : null}
        </div>
      </div>

      <SidebarControl
        sidebarOpen={narrow ? drawerOpen : showSidebar}
        onToggleSidebar={toggleSidebar}
      />
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        teams={teams}
        currentTeam={team}
        canCreateTeams={canCreateTeams}
        onSelectTeam={(next) => void openTeam(next)}
        onNewTeam={() => setNewTeamOpen(true)}
        onToggleSidebar={toggleSidebar}
      />
      <NewTeamDialog open={newTeamOpen} onOpenChange={setNewTeamOpen} />
      <UploadDialogHost
        team={team}
        onUploaded={(uploaded) => {
          put(uploaded)
          if (team)
            void navigate({
              to: '/$organizationSlug/a/$slug',
              params: { organizationSlug: team.slug, slug: uploaded.slug },
            })
        }}
      />
      <DeleteDocumentDialogHost
        onDeleted={(artifact, teamId) => {
          if (teamId === team?.id) removed(artifact)
          if (documentOpen && place.slug === artifact.slug) goHome()
        }}
      />
    </DriveContext>
  )
}
