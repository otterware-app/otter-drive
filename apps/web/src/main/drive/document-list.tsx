import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  ArchiveIcon,
  ArrowDownUpIcon,
  EllipsisIcon,
  FilesIcon,
  SearchIcon,
  SearchXIcon,
  XIcon,
} from 'lucide-react'
import type { Artifact } from '@otterware/contracts'
import { artifactBootstrapQuery } from '#/lib/artifact-query'
import { Button, IconButton } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuCheckItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/menu'
import { HintTooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { shortcutLabel } from '../keybindings/commands'
import { useCommandHandlers } from '../keybindings/dispatch'
import { TitleBand } from '../top-bar'
import type { Team } from '../teams'
import { DocumentMenuItems } from './document-menu'
import {
  KIND_META,
  documentKind,
  formatListDate,
  type DriveSearch,
} from './documents'
import { requestUpload } from './upload-dialog'

const OPEN_SEARCH_EVENT = 'otterdrive:open-search'
let searchRequested = false

/** Opens the list's search field (the sidebar's Search row, /), now or as
 *  soon as the list shows. */
export function requestOpenSearch() {
  searchRequested = true
  window.dispatchEvent(new Event(OPEN_SEARCH_EVENT))
}

const SORTS = [
  { value: 'updated', label: 'Last updated' },
  { value: 'az', label: 'Title, A to Z' },
  { value: 'za', label: 'Title, Z to A' },
] as const

/**
 * The list pane (Otter Mail's message list): a title band with the count,
 * search and sort, then one row per document. The open one stays lit; ↑↓
 * (or J/K) walk the list, opening as they go.
 */
export function DocumentList({
  team,
  documents,
  totalInView,
  loading,
  error,
  search,
  selectedSlug,
  headerLeading,
  searchRef,
  onSearchChange,
}: {
  team: Team | null
  /** What shows, after search, kind and sort. */
  documents: Artifact[]
  /** The view's documents before search and kind. */
  totalInView: number
  loading: boolean
  error: string | null
  search: DriveSearch
  selectedSlug: string | null
  headerLeading?: ReactNode
  searchRef: RefObject<HTMLInputElement | null>
  onSearchChange: (update: Partial<DriveSearch>) => void
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [searching, setSearching] = useState(Boolean(search.q))
  const query = search.q ?? ''
  const showSearch = searching || Boolean(query)
  const view = search.view ?? 'all'

  // "Search" in the sidebar (or /) opens the field; it closes when emptied
  // and left.
  useEffect(() => {
    if (query) setSearching(true)
  }, [query])
  useEffect(() => {
    const openSearch = () => {
      searchRequested = false
      setSearching(true)
      requestAnimationFrame(() => {
        searchRef.current?.focus()
        searchRef.current?.select()
      })
    }
    window.addEventListener(OPEN_SEARCH_EVENT, openSearch)
    if (searchRequested) openSearch()
    return () => window.removeEventListener(OPEN_SEARCH_EVENT, openSearch)
  }, [searchRef])

  const open = (artifact: Artifact, replace = false) => {
    if (!team) return
    void navigate({
      to: '/$organizationSlug/a/$slug',
      params: { organizationSlug: team.slug, slug: artifact.slug },
      search: (current) => ({ ...current, sheet: undefined }),
      replace,
    })
  }

  /** J/K anywhere, ↑↓ with the list focused; a key that moves nothing passes. */
  const step = (event: KeyboardEvent, delta: 1 | -1) => {
    const inList = scrollRef.current?.contains(document.activeElement) ?? false
    if (event.key.startsWith('Arrow') && !inList) return false
    if (documents.length === 0) return false
    const index = documents.findIndex((item) => item.slug === selectedSlug)
    const next =
      index < 0
        ? delta > 0
          ? 0
          : documents.length - 1
        : Math.min(documents.length - 1, Math.max(0, index + delta))
    const artifact = documents[next]
    if (!artifact || artifact.slug === selectedSlug) return false
    open(artifact, index >= 0)
    const row = scrollRef.current?.querySelector<HTMLElement>(
      `[data-slug="${CSS.escape(artifact.slug)}"]`,
    )
    row?.scrollIntoView({ block: 'nearest' })
    // Arrowing through the list keeps the focus on the open row.
    if (inList) row?.focus({ preventScroll: true })
  }

  useCommandHandlers({
    'list.next': (event) => step(event, 1),
    'list.previous': (event) => step(event, -1),
  })

  const prefetch = (artifact: Artifact) => {
    if (team)
      void queryClient.prefetchQuery(
        artifactBootstrapQuery(team.id, artifact.slug),
      )
  }

  const summary = loading
    ? ' '
    : `${totalInView} ${totalInView === 1 ? 'document' : 'documents'}${
        view === 'archived'
          ? ' archived'
          : view === 'recent'
            ? ' this week'
            : ''
      }`

  return (
    <div className="relative flex h-full min-w-0 flex-col">
      <TitleBand>
        {headerLeading}
        {showSearch ? (
          <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-full bg-foreground/[0.06] ps-3 pe-2 transition-colors focus-within:bg-foreground/[0.08]">
            <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
            <input
              ref={searchRef}
              type="text"
              autoFocus={!query}
              value={query}
              placeholder={`Search ${team?.name ?? 'documents'}`}
              aria-label="Search documents"
              spellCheck={false}
              onChange={(event) =>
                onSearchChange({ q: event.target.value || undefined })
              }
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  if (query) onSearchChange({ q: undefined })
                  else setSearching(false)
                  event.currentTarget.blur()
                }
                if (event.key === 'ArrowDown' || event.key === 'Enter') {
                  const first = documents[0]
                  if (first) {
                    event.preventDefault()
                    event.currentTarget.blur()
                    if (event.key === 'Enter' || !selectedSlug) open(first)
                  }
                }
              }}
              onBlur={(event) => {
                if (!event.currentTarget.value) setSearching(false)
              }}
              className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-placeholder"
            />
            {query ? (
              <button
                type="button"
                aria-label="Clear search"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onSearchChange({ q: undefined })
                  searchRef.current?.focus()
                }}
                className="flex size-4 shrink-0 items-center justify-center rounded-full bg-muted-foreground text-canvas outline-none transition-colors hover:bg-foreground focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                <XIcon className="size-2.5" strokeWidth={3} />
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
              {summary}
            </div>
            <HintTooltip
              label="Search this team"
              hint={shortcutLabel('search.focus')}
              side="bottom"
            >
              <IconButton
                label="Search this team"
                onClick={() => {
                  setSearching(true)
                  requestAnimationFrame(() => searchRef.current?.focus())
                }}
              >
                <SearchIcon className="size-4" />
              </IconButton>
            </HintTooltip>
          </>
        )}
        <DropdownMenu>
          <HintTooltip label="Sort" side="bottom">
            <DropdownMenuTrigger
              render={
                <IconButton
                  label="Sort documents"
                  active={Boolean(search.sort && search.sort !== 'updated')}
                />
              }
            >
              <ArrowDownUpIcon className="size-4" />
            </DropdownMenuTrigger>
          </HintTooltip>
          <DropdownMenuContent align="end" className="min-w-48">
            <DropdownMenuLabel>Sort by</DropdownMenuLabel>
            {SORTS.map((sort) => (
              <DropdownMenuCheckItem
                key={sort.value}
                checked={(search.sort ?? 'updated') === sort.value}
                onClick={() =>
                  onSearchChange({
                    sort: sort.value === 'updated' ? undefined : sort.value,
                  })
                }
              >
                {sort.label}
              </DropdownMenuCheckItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </TitleBand>

      <div
        ref={scrollRef}
        role="list"
        aria-label="Documents"
        className="min-h-0 flex-1 overflow-y-auto pt-[9px] pb-1 [scrollbar-gutter:stable_both-edges]"
      >
        {error ? (
          <EmptyState
            className="h-full px-6"
            icon={SearchXIcon}
            title="Couldn’t load documents"
            description={error}
          />
        ) : loading ? (
          <DocumentListSkeleton />
        ) : documents.length === 0 ? (
          <EmptyList search={search} total={totalInView} />
        ) : (
          documents.map((artifact) => (
            <DocumentRow
              key={artifact.id}
              artifact={artifact}
              team={team!}
              selected={artifact.slug === selectedSlug}
              onPrefetch={() => prefetch(artifact)}
            />
          ))
        )}
      </div>
    </div>
  )
}

function EmptyList({ search, total }: { search: DriveSearch; total: number }) {
  if (search.q || (search.kind && total > 0)) {
    return (
      <EmptyState
        className="h-full px-6"
        icon={SearchXIcon}
        title="No matches"
        description={
          search.q
            ? `Nothing here matches “${search.q}”.`
            : 'Nothing of that kind here.'
        }
      />
    )
  }
  if (search.view === 'archived') {
    return (
      <EmptyState
        className="h-full px-6"
        icon={ArchiveIcon}
        title="Nothing archived"
        description="Archived documents wait here until you restore or delete them."
      />
    )
  }
  if (search.view === 'recent') {
    return (
      <EmptyState
        className="h-full px-6"
        icon={FilesIcon}
        title="A quiet week"
        description="Nothing changed in the last seven days."
      />
    )
  }
  return (
    <EmptyState
      className="h-full px-6"
      icon={FilesIcon}
      title="No documents yet"
      description="Drop files anywhere, or upload a file or folder."
      actions={
        <Button variant="accent" onClick={requestUpload}>
          Upload
        </Button>
      }
    />
  )
}

/** A document's face in lists: its thumbnail, or its kind's icon. */
export function DocumentThumb({
  artifact,
  className,
}: {
  artifact: Artifact
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  const Icon = KIND_META[documentKind(artifact)].icon
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/70 bg-surface-raised/70 text-icon-muted',
        className,
      )}
    >
      {artifact.thumbnailUrl && !failed ? (
        <img
          src={artifact.thumbnailUrl}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className="size-full object-cover object-top"
          onError={() => setFailed(true)}
        />
      ) : (
        <Icon className="size-4" strokeWidth={1.75} />
      )}
    </span>
  )
}

function DocumentRow({
  artifact,
  team,
  selected,
  onPrefetch,
}: {
  artifact: Artifact
  team: Team
  selected: boolean
  onPrefetch: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const kind = KIND_META[documentKind(artifact)].one
  const version = artifact.currentVersion?.number ?? 1
  const href = `/${team.slug}/a/${artifact.slug}`
  const details = [
    kind,
    version > 1 ? `v${version}` : null,
    artifact.archivedAt ? 'Archived' : null,
  ].filter(Boolean)

  return (
    // Off-screen rows skip layout and paint; `auto` remembers each row's
    // real height once it has rendered.
    <div
      role="listitem"
      className="group/row relative px-1 py-px [contain-intrinsic-size:auto_68px] [content-visibility:auto]"
    >
      <ContextMenu>
        <ContextMenuTrigger
          render={
            <Link
              to="/$organizationSlug/a/$slug"
              params={{ organizationSlug: team.slug, slug: artifact.slug }}
              search={(current) => ({ ...current, sheet: undefined })}
              data-slug={artifact.slug}
              aria-current={selected ? 'page' : undefined}
              onMouseEnter={onPrefetch}
              onFocus={onPrefetch}
              draggable={false}
            />
          }
          className={cn(
            'group relative flex w-full items-start gap-3 overflow-hidden rounded-lg px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus-ring',
            selected
              ? 'bg-sidebar-row-active'
              : menuOpen
                ? 'bg-sidebar-row-hover'
                : 'group-hover/row:bg-sidebar-row-hover',
          )}
        >
          <DocumentThumb artifact={artifact} className="mt-0.5 size-9" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-sm leading-snug font-medium text-foreground">
                {artifact.title}
              </span>
              <span
                className={cn(
                  'shrink-0 text-xs text-muted-foreground tabular-nums',
                  'group-focus-within/row:invisible group-hover/row:invisible',
                  menuOpen && 'invisible',
                )}
              >
                {formatListDate(artifact.updatedAt)}
              </span>
            </div>
            <span
              className={cn(
                'truncate text-[13px] leading-snug',
                artifact.description
                  ? 'text-muted-foreground'
                  : 'text-muted-foreground/60',
              )}
            >
              {artifact.description ||
                artifact.currentVersion?.entryPath ||
                artifact.slug}
            </span>
            <span className="truncate text-2xs text-muted-foreground/75">
              {details.join(' · ')}
            </span>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <DocumentMenuItems artifact={artifact} team={team} href={href} />
        </ContextMenuContent>
      </ContextMenu>
      {/* The row's menu, where its date sits until it's hovered. */}
      <RowMenu
        artifact={artifact}
        team={team}
        href={href}
        open={menuOpen}
        onOpenChange={setMenuOpen}
      />
    </div>
  )
}

function RowMenu({
  artifact,
  team,
  href,
  open,
  onOpenChange,
}: {
  artifact: Artifact
  team: Team
  href: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={`Actions for ${artifact.title}`}
            className={cn(
              'absolute top-2 right-3.5 flex size-6 items-center justify-center rounded-md text-muted-foreground outline-none transition-opacity hover:bg-foreground/[0.07] hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-focus-ring',
              open
                ? 'opacity-100'
                : 'opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100',
            )}
          />
        }
      >
        <EllipsisIcon className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DocumentMenuItems artifact={artifact} team={team} href={href} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function DocumentListSkeleton() {
  return (
    <div className="flex flex-col" aria-hidden>
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="flex w-full items-start gap-3 px-4 py-3">
          <div className="size-9 shrink-0 animate-skeleton rounded-md bg-accent-surface" />
          <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
            <div className="h-3.5 w-32 animate-skeleton rounded-full bg-secondary" />
            <div className="h-3 w-48 animate-skeleton rounded-full bg-accent-surface" />
            <div className="h-2.5 w-20 animate-skeleton rounded-full bg-accent-surface" />
          </div>
        </div>
      ))}
    </div>
  )
}
