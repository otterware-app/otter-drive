import { useEffect, useMemo, useState } from 'react'
import {
  ChevronRightIcon,
  FolderIcon,
  FolderOpenIcon,
  HardDriveIcon,
  UsersIcon,
} from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from '@/components/ui/menu'
import { cn } from '@/lib/utils'
import {
  SIDEBAR_ROW,
  SIDEBAR_ROW_IDLE,
  SIDEBAR_ROW_SELECTED,
} from '../sidebar-ui'
import { folderLabel, folderPath, type Folder } from '../folders'
import { FolderMenuItems } from './folder-menu'

/**
 * The sidebar's folders (Google Drive's tree): the drive, or the folder
 * shared with you, and the folders inside it, opening on click. The way to
 * the open folder starts expanded; chevrons expand the rest.
 */
export function FolderTree({
  folders,
  root,
  currentId,
  onOpen,
  onDeleted,
}: {
  folders: Folder[]
  root: Folder
  /** The folder showing in the list, lit; null when another view is. */
  currentId: string | null
  onOpen: (folder: Folder) => void
  onDeleted?: (folder: Folder) => void
}) {
  const children = useMemo(() => {
    const map = new Map<string, Folder[]>()
    for (const folder of folders) {
      if (!folder.parentId) continue
      map.set(folder.parentId, [...(map.get(folder.parentId) ?? []), folder])
    }
    for (const list of map.values())
      list.sort((left, right) => left.name.localeCompare(right.name))
    return map
  }, [folders])
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

  // Keep the way to the open folder expanded as it changes.
  const current = folders.find((folder) => folder.id === currentId) ?? null
  const path = folderPath(folders, current)
  const pathKey = path.map((folder) => folder.id).join('/')
  useEffect(() => {
    if (!pathKey) return
    setExpanded((open) => {
      const ids = pathKey.split('/').slice(0, -1)
      if (ids.every((id) => open.has(id))) return open
      return new Set([...open, ...ids])
    })
  }, [pathKey])

  const toggle = (id: string) =>
    setExpanded((open) => {
      const next = new Set(open)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const renderRow = (folder: Folder, depth: number) => {
    const kids = children.get(folder.id) ?? []
    // The root is always open: its folders are the tree.
    const open = depth === 0 || expanded.has(folder.id)
    const selected = folder.id === currentId
    const Icon =
      folder.kind === 'personal'
        ? HardDriveIcon
        : folder.kind === 'shared'
          ? UsersIcon
          : selected
            ? FolderOpenIcon
            : FolderIcon
    return (
      <li key={folder.id}>
        <ContextMenu>
          <ContextMenuTrigger
            render={
              <div
                role="treeitem"
                aria-selected={selected}
                aria-expanded={kids.length && depth > 0 ? open : undefined}
                aria-level={depth + 1}
                tabIndex={0}
                onClick={() => onOpen(folder)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onOpen(folder)
                  } else if (event.key === 'ArrowRight' && kids.length)
                    setExpanded((set) => new Set([...set, folder.id]))
                  else if (event.key === 'ArrowLeft' && open && depth > 0)
                    toggle(folder.id)
                }}
                style={{
                  paddingInlineStart: `calc(var(--sidebar-row-content-inset) + ${Math.max(depth - 1, 0) * 14}px)`,
                }}
                className={cn(
                  SIDEBAR_ROW,
                  'cursor-pointer gap-1.5 pe-(--sidebar-row-content-inset)',
                  selected ? SIDEBAR_ROW_SELECTED : SIDEBAR_ROW_IDLE,
                )}
              />
            }
          >
            {depth === 0 ? null : kids.length ? (
              <button
                type="button"
                tabIndex={-1}
                aria-label={
                  open ? `Collapse ${folder.name}` : `Expand ${folder.name}`
                }
                onClick={(event) => {
                  event.stopPropagation()
                  toggle(folder.id)
                }}
                className="flex size-4 shrink-0 items-center justify-center rounded text-sidebar-muted-foreground hover:text-sidebar-foreground"
              >
                <ChevronRightIcon
                  className={cn(
                    'size-3.5 transition-transform',
                    open && 'rotate-90',
                  )}
                />
              </button>
            ) : (
              <span aria-hidden className="size-4 shrink-0" />
            )}
            <Icon
              className={cn(
                depth > 0 && 'ms-0.5',
                selected
                  ? 'text-sidebar-foreground'
                  : 'text-sidebar-muted-foreground group-hover:text-sidebar-foreground',
              )}
            />
            <span className="ms-1 min-w-0 flex-1 truncate">
              {folderLabel(folder)}
            </span>
            {folder.shared && folder.kind === 'folder' ? (
              <UsersIcon
                aria-label="Shared"
                className="size-3.5! text-sidebar-muted-foreground/80"
              />
            ) : null}
          </ContextMenuTrigger>
          <ContextMenuContent>
            <FolderMenuItems
              folder={folder}
              onOpen={() => onOpen(folder)}
              {...(onDeleted ? { onDeleted } : {})}
            />
          </ContextMenuContent>
        </ContextMenu>
        {open && kids.length ? (
          <ul role="group" className="flex flex-col gap-0.5 pt-0.5">
            {kids.map((kid) => renderRow(kid, depth + 1))}
          </ul>
        ) : null}
      </li>
    )
  }

  return (
    <ul role="tree" aria-label="Folders" className="flex flex-col gap-0.5">
      {renderRow(root, 0)}
    </ul>
  )
}
