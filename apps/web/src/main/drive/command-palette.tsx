import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from '@tanstack/react-router'
import { useQueries } from '@tanstack/react-query'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronRightIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  SunIcon,
  SunMoonIcon,
  UploadIcon,
  UsersIcon,
  FolderIcon,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import type { Artifact } from '@otterware/contracts'
import { Kbd } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { shortcutLabel, type KeybindingCommand } from '../keybindings/commands'
import { PaneIcon } from '../top-bar'
import {
  folderLabel,
  folderPath,
  useSharedWithMe,
  type Folder,
} from '../folders'
import {
  KIND_META,
  documentKind,
  documentsQuery,
  formatListDate,
} from './documents'
import { FolderMark } from './folder-mark'
import { signOut } from './folder-rail'
import { requestUpload } from './upload-dialog'

/**
 * Command palette (⌘K), Otter Mail's: a card anchored near the top, a large
 * search field, grouped results (icon, title, optional subtitle, trailing
 * date or shortcut), a submenu (Backspace goes back), and a key-hint
 * footer. Documents are searched across every folder.
 */

type Page = 'root' | 'appearance'

type PaletteItem = {
  id: string
  icon: ReactNode
  title: string
  description?: string
  /** Searchable text beyond the title. */
  keywords?: string
  trailing?: ReactNode
  shortcut?: string | undefined
  checked?: boolean
  /** Opens a submenu instead of running. */
  submenu?: Page
  run?: () => void
}

type PaletteGroup = { id: string; label: string; items: PaletteItem[] }

const ICON = 'size-4'
const MAX_DOCUMENTS = 12

/** Words of a text, for matching the start of any of them. */
const words = (text: string) => text.toLowerCase().split(/[^\p{L}\p{N}]+/u)

/**
 * How well an item matches what's typed (Otter Mail's): 4 its title starts
 * with it, 3 every typed word starts a word of the title, 2 the same counting
 * its description and keywords, 1 the text appears anywhere; 0 not at all.
 */
function matchScore(item: PaletteItem, needle: string): number {
  if (!needle) return 1
  const title = item.title.toLowerCase()
  if (title.startsWith(needle)) return 4
  const typed = needle.split(/\s+/)
  const startsAWord = (list: string[]) =>
    typed.every((part) => list.some((word) => word.startsWith(part)))
  if (startsAWord(words(title))) return 3
  const rest = `${item.description ?? ''} ${item.keywords ?? ''}`
  if (startsAWord(words(`${title} ${rest}`))) return 2
  return `${title} ${rest.toLowerCase()}`.includes(needle) ? 1 : 0
}

type CommandPaletteProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  folders: Folder[]
  currentFolder: Folder | null
  canCreateFolders: boolean
  onSelectFolder: (folder: Folder) => void
  onOpenShared: () => void
  onNewFolder: () => void
  onToggleSidebar: () => void
}

/** Mounted only while open: each opening starts fresh, and nothing runs
 *  (or reads the cached lists) while it's closed. */
export function CommandPalette(props: CommandPaletteProps) {
  return props.open ? <PaletteCard {...props} /> : null
}

function PaletteCard({
  onOpenChange,
  folders,
  currentFolder,
  canCreateFolders,
  onSelectFolder,
  onOpenShared,
  onNewFolder,
  onToggleSidebar,
}: CommandPaletteProps) {
  const navigate = useNavigate()
  const { theme, setTheme } = useTheme()
  const [query, setQuery] = useState('')
  const [page, setPage] = useState<Page>('root')
  const [highlight, setHighlight] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    inputRef.current?.focus()
  }, [page])

  const shared = useSharedWithMe()
  const documentQueries = useQueries({
    queries: folders.map((folder) => ({
      ...documentsQuery(folder.id, 'active'),
    })),
  })
  const documentsByFolder = folders.map((folder, index) => ({
    folder,
    documents: documentQueries[index]?.data ?? [],
  }))
  const loadingDocuments = documentQueries.some((result) => result.isPending)

  const close = () => onOpenChange(false)

  const groups = ((): PaletteGroup[] => {
    const needle = query.trim().toLowerCase()
    // Best first within each group (a stable sort keeps the list's order on ties).
    const filter = (list: PaletteGroup[]) =>
      list
        .map((group) => ({
          ...group,
          items: group.items
            .map((item) => ({ item, score: matchScore(item, needle) }))
            .filter((match) => match.score > 0)
            .sort((left, right) => right.score - left.score)
            .map((match) => match.item),
        }))
        .filter((group) => group.items.length > 0)

    if (page === 'appearance') {
      const options = [
        {
          id: 'system',
          title: 'System',
          icon: <MonitorIcon className={ICON} />,
        },
        { id: 'light', title: 'Light', icon: <SunIcon className={ICON} /> },
        { id: 'dark', title: 'Dark', icon: <MoonIcon className={ICON} /> },
      ]
      return filter([
        {
          id: 'appearance',
          label: 'Change appearance',
          items: options.map((option) => ({
            id: `appearance:${option.id}`,
            icon: option.icon,
            title: option.title,
            checked: (theme ?? 'system') === option.id,
            run: () => setTheme(option.id),
          })),
        },
      ])
    }

    const where = (folder: Folder) =>
      folderPath(folders, folder).map(folderLabel).join(' › ')
    const documentItem = (
      place: { slug: string; label: string },
      artifact: Artifact,
    ): PaletteItem => {
      const Icon = KIND_META[documentKind(artifact)].icon
      return {
        id: `document:${artifact.id}`,
        icon: <Icon className={ICON} />,
        title: artifact.title,
        description: `${place.label} · ${artifact.description || artifact.slug}`,
        keywords: `${artifact.slug} ${place.label}`,
        trailing: formatListDate(artifact.updatedAt),
        run: () =>
          void navigate({
            to: '/$folderSlug/a/$slug',
            params: { folderSlug: place.slug, slug: artifact.slug },
          }),
      }
    }
    const inFolder = (folder: Folder) => ({
      slug: folder.slug,
      label: where(folder),
    })

    const sc = (command: KeybindingCommand) => shortcutLabel(command)
    const actions: PaletteItem[] = [
      {
        id: 'upload',
        icon: <UploadIcon className={ICON} />,
        title: 'Upload',
        keywords: 'new document file folder add',
        shortcut: sc('document.upload'),
        run: requestUpload,
      },
      ...(canCreateFolders
        ? [
            {
              id: 'new-folder',
              icon: <PlusIcon className={ICON} />,
              title: 'New folder',
              keywords: 'create folder workspace',
              run: onNewFolder,
            },
          ]
        : []),
      {
        id: 'shared-with-me',
        icon: <UsersIcon className={ICON} />,
        title: 'Shared with me',
        keywords: 'shares others people go to',
        run: onOpenShared,
      },
      {
        id: 'sidebar',
        icon: <PaneIcon side="left" open className={ICON} />,
        title: 'Toggle sidebar',
        shortcut: sc('sidebar.toggle'),
        run: onToggleSidebar,
      },
      {
        id: 'appearance',
        icon: <SunMoonIcon className={ICON} />,
        title: 'Change appearance',
        keywords: 'dark light system mode theme',
        submenu: 'appearance',
      },
      {
        id: 'settings',
        icon: <SettingsIcon className={ICON} />,
        title: 'Settings',
        keywords: 'preferences members invite api keys agents',
        run: () =>
          void navigate({ to: '/settings/$pane', params: { pane: 'folder' } }),
      },
      {
        id: 'sign-out',
        icon: <LogOutIcon className={ICON} />,
        title: 'Sign out of Otter',
        keywords: 'log out',
        run: signOut,
      },
    ]

    const drives = folders.filter((folder) => !folder.parentId)
    const folderItems: PaletteItem[] = folders.map((folder) => {
      const index = drives.indexOf(folder)
      const parent = folders.find((item) => item.id === folder.parentId)
      return {
        id: `folder:${folder.id}`,
        icon: folder.parentId ? (
          <FolderIcon className={ICON} />
        ) : (
          <FolderMark folder={folder} className="size-4 text-[7px]" />
        ),
        title: folderLabel(folder),
        ...(parent ? { description: where(parent) } : {}),
        keywords: `switch folder drive go to ${folder.kind === 'shared' ? 'shared drive' : ''}`,
        shortcut:
          index >= 0 && index < 9
            ? sc(`folder.jump.${index + 1}` as KeybindingCommand)
            : undefined,
        checked: folder.id === currentFolder?.id,
        run: () => onSelectFolder(folder),
      }
    })

    if (!needle) {
      const recent = (
        documentsByFolder.find((entry) => entry.folder.id === currentFolder?.id)
          ?.documents ?? []
      )
        .slice()
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, 5)
      return [
        ...(currentFolder && recent.length
          ? [
              {
                id: 'recent',
                label: 'Recently updated',
                items: recent.map((artifact) =>
                  documentItem(inFolder(currentFolder), artifact),
                ),
              },
            ]
          : []),
        { id: 'actions', label: 'Actions', items: actions },
        ...(drives.length > 1
          ? [
              {
                id: 'folders',
                label: 'Drives',
                items: folderItems.filter((item) =>
                  drives.some((drive) => item.id === `folder:${drive.id}`),
                ),
              },
            ]
          : []),
      ]
    }

    const documents = filter([
      {
        id: 'documents',
        label: 'Documents',
        items: [
          ...documentsByFolder.flatMap(({ folder, documents }) =>
            documents.map((artifact) =>
              documentItem(inFolder(folder), artifact),
            ),
          ),
          // Documents shared with you on their own, outside your folders.
          ...shared.listed.flatMap((item) =>
            item.artifact &&
            !folders.some((folder) => folder.id === item.artifact!.folderId)
              ? [
                  documentItem(
                    { slug: item.folderSlug, label: 'Shared with me' },
                    item.artifact,
                  ),
                ]
              : [],
          ),
        ],
      },
    ]).map((group) => ({
      ...group,
      items: group.items.slice(0, MAX_DOCUMENTS),
    }))
    return [
      ...documents,
      ...filter([
        { id: 'actions', label: 'Actions', items: actions },
        { id: 'folders', label: 'Folders', items: folderItems },
      ]),
    ]
  })()

  const flat = groups.flatMap((group) => group.items)
  const clamped = Math.min(highlight, Math.max(flat.length - 1, 0))

  // A fresh list starts at its top.
  const listKey = `${page}\u0000${query}`
  const [highlightFor, setHighlightFor] = useState(listKey)
  if (highlightFor !== listKey) {
    setHighlightFor(listKey)
    setHighlight(0)
  }

  // Keep the highlighted row in view while arrowing.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${clamped}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [clamped])

  const execute = (item: PaletteItem | undefined) => {
    if (!item) return
    if (item.submenu) {
      setQuery('')
      setPage(item.submenu)
      return
    }
    close()
    item.run?.()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlight((current) =>
        flat.length
          ? (Math.min(current, flat.length - 1) + 1) % flat.length
          : 0,
      )
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlight((current) =>
        flat.length
          ? (Math.min(current, flat.length - 1) - 1 + flat.length) % flat.length
          : 0,
      )
    } else if (event.key === 'Enter') {
      event.preventDefault()
      execute(flat[clamped])
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close()
    } else if (event.key === 'Backspace' && query === '' && page !== 'root') {
      event.preventDefault()
      setPage('root')
    } else if (event.key === 'Tab') {
      // The field keeps the focus; the arrows move through the results.
      event.preventDefault()
    }
  }

  let index = -1
  return createPortal(
    <div className="fixed inset-0 z-[100]" role="presentation">
      {/* Backdrop: clear, like Linear's; a click outside closes. */}
      <div className="absolute inset-0" onPointerDown={close} aria-hidden />
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center px-4 pt-[10vh]">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
          className="pointer-events-auto relative flex max-h-105 w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-foreground/10 bg-popover text-foreground shadow-[0_24px_64px_-24px_rgb(0_0_0/45%)] animate-[dialog-pop-in_160ms_cubic-bezier(0.32,0.72,0,1)] dark:shadow-[0_24px_64px_-24px_rgb(0_0_0/80%)]"
        >
          <div className="relative flex h-12 shrink-0 items-center gap-2.5 px-4">
            <SearchIcon
              className="size-4 shrink-0 text-icon-muted"
              aria-hidden
            />
            <input
              ref={inputRef}
              autoCorrect="off"
              autoCapitalize="off"
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder={
                page === 'appearance'
                  ? 'Change appearance…'
                  : 'Search documents or type a command…'
              }
              aria-label="Search documents and commands"
              role="combobox"
              aria-expanded="true"
              aria-controls="command-palette-results"
              aria-activedescendant={
                flat[clamped] ? `command-palette-option-${clamped}` : undefined
              }
              className="h-full min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-placeholder"
            />
          </div>

          <div
            ref={listRef}
            id="command-palette-results"
            role="listbox"
            aria-label="Results"
            className="min-h-0 flex-1 scroll-py-1.5 overflow-y-auto border-t border-border/50 p-1.5"
          >
            {flat.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                {loadingDocuments
                  ? 'Searching…'
                  : 'No matching documents or commands.'}
              </div>
            ) : (
              groups.map((group) => (
                <div
                  key={group.id}
                  className="[&+&]:mt-1.5"
                  role="group"
                  aria-label={group.label}
                >
                  <div className="px-2.5 pt-2 pb-1 text-[13px] text-muted-foreground">
                    {group.label}
                  </div>
                  {group.items.map((item) => {
                    index += 1
                    const itemIndex = index
                    const active = itemIndex === clamped
                    return (
                      <div
                        key={item.id}
                        id={`command-palette-option-${itemIndex}`}
                        role="option"
                        aria-selected={active}
                        data-index={itemIndex}
                        onMouseMove={() => setHighlight(itemIndex)}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => execute(item)}
                        className={cn(
                          "flex min-h-8 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm outline-none select-none [&_svg:not([class*='text-'])]:text-muted-foreground",
                          active && 'bg-foreground/[0.07] text-foreground',
                        )}
                      >
                        {item.icon}
                        {item.description ? (
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-sm text-foreground">
                              {item.title}
                            </span>
                            <span className="truncate text-xs text-muted-foreground">
                              {item.description}
                            </span>
                          </span>
                        ) : (
                          <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                            {item.title}
                          </span>
                        )}
                        {item.checked ? (
                          <CheckIcon className="size-3.5 shrink-0 text-foreground" />
                        ) : null}
                        {item.trailing ? (
                          <span className="min-w-12 shrink-0 text-right text-xs text-muted-foreground/70 tabular-nums">
                            {item.trailing}
                          </span>
                        ) : null}
                        {item.shortcut ? (
                          <kbd className="ms-auto shrink-0 font-sans text-xs font-medium tracking-widest text-muted-foreground">
                            {item.shortcut}
                          </kbd>
                        ) : null}
                        {item.submenu ? (
                          <ChevronRightIcon className="ms-auto -me-0.5 size-4 shrink-0 text-muted-foreground/70" />
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              ))
            )}
          </div>

          <div className="flex shrink-0 items-center gap-3 border-t border-border/50 px-4 py-2.5 text-[13px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Kbd>
                <ArrowUpIcon />
              </Kbd>
              <Kbd>
                <ArrowDownIcon />
              </Kbd>
              <span className="ms-1">Navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <Kbd>Enter</Kbd>
              <span className="ms-1">
                {flat[clamped]?.submenu ? 'Open' : 'Select'}
              </span>
            </span>
            {page !== 'root' ? (
              <span className="flex items-center gap-1">
                <Kbd>Backspace</Kbd>
                <span className="ms-1">Back</span>
              </span>
            ) : null}
            <span className="flex items-center gap-1">
              <Kbd>Esc</Kbd>
              <span className="ms-1">Close</span>
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
