import { useMemo, type ReactNode } from 'react'
import {
  ArchiveIcon,
  ChevronDownIcon,
  ClockIcon,
  FolderPlusIcon,
  PlusIcon,
  UploadIcon,
  XIcon,
} from 'lucide-react'
import type { Artifact } from '@otterware/contracts'
import { IconButton } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/menu'
import { HintTooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { shortcutLabel } from '../keybindings/commands'
import {
  DOCUMENT_KINDS,
  KIND_META,
  documentKind,
  inView,
  type DriveSearch,
} from './documents'

/** A filter chip (Google Drive's Type, Modified…): lit while it applies. */
const CHIP =
  'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border text-[13px] whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus-ring [&_svg]:size-3.5 [&_svg]:shrink-0'
const CHIP_IDLE =
  'border-border px-2.5 text-muted-foreground hover:bg-accent-surface hover:text-foreground data-popup-open:bg-accent-surface data-popup-open:text-foreground'
const CHIP_ON = 'border-transparent bg-foreground/[0.09] ps-2.5 text-foreground'

/**
 * The filters under the list's title band, Google Drive's chips: the kinds
 * of document there are, what changed this week, and the archive. In
 * "Shared with me", only the kinds.
 */
export function ListFilters({
  documents,
  search,
  sharedView,
  onChange,
}: {
  /** The documents the chips count: the folder's, or what's shared. */
  documents: Artifact[]
  search: DriveSearch
  sharedView: boolean
  /** Changes the view or kind (and closes an open document). */
  onChange: (update: Pick<DriveSearch, 'view' | 'kind'>) => void
}) {
  const counts = useMemo(() => {
    const now = Date.now()
    const byKind = new Map<string, number>()
    let recent = 0
    for (const artifact of documents) {
      if (artifact.archivedAt) continue
      const kind = documentKind(artifact)
      byKind.set(kind, (byKind.get(kind) ?? 0) + 1)
      if (inView(artifact, 'recent', now)) recent += 1
    }
    return { byKind, recent }
  }, [documents])
  const kinds = DOCUMENT_KINDS.filter(
    (kind) => counts.byKind.get(kind) || kind === search.kind,
  )
  const view = sharedView ? 'shared' : search.view
  const KindIcon = search.kind ? KIND_META[search.kind].icon : null

  return (
    <div
      role="toolbar"
      aria-label="Filters"
      className="flex shrink-0 items-center gap-1.5 overflow-x-auto px-4 pt-[11px] pb-1.5 [scrollbar-width:none]"
    >
      {kinds.length > 1 || search.kind ? (
        <DropdownMenu>
          {search.kind && KindIcon ? (
            <Chip
              on
              label={KIND_META[search.kind].label}
              icon={<KindIcon />}
              trigger
              onClear={() => onChange({ view, kind: undefined })}
            />
          ) : (
            <DropdownMenuTrigger
              render={<button type="button" className={cn(CHIP, CHIP_IDLE)} />}
            >
              Type
              <ChevronDownIcon />
            </DropdownMenuTrigger>
          )}
          <DropdownMenuContent align="start" className="min-w-48">
            {kinds.map((kind) => {
              const Icon = KIND_META[kind].icon
              return (
                <DropdownMenuCheckItem
                  key={kind}
                  icon={<Icon />}
                  checked={search.kind === kind}
                  onClick={() =>
                    onChange({
                      view,
                      kind: search.kind === kind ? undefined : kind,
                    })
                  }
                >
                  <span className="flex w-full items-center gap-3">
                    <span className="flex-1">{KIND_META[kind].label}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {counts.byKind.get(kind) ?? 0}
                    </span>
                  </span>
                </DropdownMenuCheckItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {sharedView ? null : (
        <>
          <Chip
            on={search.view === 'recent'}
            label="Updated this week"
            icon={<ClockIcon />}
            count={counts.recent}
            onToggle={() =>
              onChange({
                view: search.view === 'recent' ? undefined : 'recent',
                kind: search.kind,
              })
            }
          />
          <Chip
            on={search.view === 'archived'}
            label="Archived"
            icon={<ArchiveIcon />}
            onToggle={() =>
              onChange({
                view: search.view === 'archived' ? undefined : 'archived',
                kind: search.kind,
              })
            }
          />
        </>
      )}
    </div>
  )
}

/**
 * One chip: a switch, or (with `trigger`) the menu's trigger while it
 * applies; a lit chip clears with its ×.
 */
function Chip({
  on,
  label,
  icon,
  count,
  trigger,
  onToggle,
  onClear,
}: {
  on: boolean
  label: string
  icon: ReactNode
  count?: number
  trigger?: boolean
  onToggle?: () => void
  onClear?: () => void
}) {
  const clear = onClear ?? onToggle
  const body = (
    <>
      {icon}
      {label}
      {!on && count ? (
        <span className="text-xs text-muted-foreground/80 tabular-nums">
          {count}
        </span>
      ) : null}
    </>
  )
  if (!on)
    return (
      <button
        type="button"
        aria-pressed={false}
        onClick={onToggle}
        className={cn(CHIP, CHIP_IDLE)}
      >
        {body}
      </button>
    )
  return (
    <span className={cn(CHIP, CHIP_ON, 'gap-0 pe-0.5')}>
      {trigger ? (
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className="inline-flex items-center gap-1.5 outline-none"
            />
          }
        >
          {body}
        </DropdownMenuTrigger>
      ) : (
        <button
          type="button"
          aria-pressed
          onClick={onToggle}
          className="inline-flex items-center gap-1.5 outline-none"
        >
          {body}
        </button>
      )}
      <button
        type="button"
        aria-label={`Clear ${label}`}
        onClick={clear}
        className="ms-1 flex size-5 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        <XIcon className="size-3!" />
      </button>
    </span>
  )
}

/** The list's New: a folder here, or an upload (what the sidebar's New was). */
export function NewMenu({
  disabled,
  onNewFolder,
  onUpload,
}: {
  disabled: boolean
  onNewFolder: () => void
  onUpload: () => void
}) {
  return (
    <DropdownMenu>
      <HintTooltip label="New" side="bottom">
        <DropdownMenuTrigger
          disabled={disabled}
          render={<IconButton label="New folder or upload" />}
        >
          <PlusIcon className="size-4" />
        </DropdownMenuTrigger>
      </HintTooltip>
      <DropdownMenuContent align="end" className="min-w-56">
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
  )
}
