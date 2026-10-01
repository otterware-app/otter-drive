import { useState, type ComponentProps, type ReactNode } from 'react'
import { ChevronDownIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * The sidebar's rows (Otter Mail's accounts-sidebar.tsx, after Codex): 14px
 * regular text, a muted icon, and a rounded pill on hover and when selected.
 * The drive sidebar and Settings' nav share them.
 */

export const SIDEBAR_ROW =
  "group flex h-8 w-full items-center gap-2.5 rounded-lg text-left text-sm font-normal outline-none transition-[background-color,color] focus-visible:ring-2 focus-visible:ring-focus-ring active:bg-sidebar-row-active [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0"

export const SIDEBAR_ROW_IDLE =
  'text-sidebar-foreground/90 hover:bg-sidebar-row-hover hover:text-sidebar-foreground'

export const SIDEBAR_ROW_SELECTED =
  'bg-sidebar-row-selected text-sidebar-foreground'

/** A quiet count at the row's end, brightening on the selected row. */
export function RowCount({
  count,
  selected,
}: {
  count: number
  selected?: boolean | undefined
}) {
  if (count <= 0) return null
  return (
    <span
      className={cn(
        'ml-auto shrink-0 text-xs tabular-nums',
        selected ? 'text-sidebar-foreground' : 'text-muted-foreground/70',
      )}
    >
      {count > 999 ? '999+' : count}
    </span>
  )
}

export function SidebarRow({
  icon,
  title,
  selected,
  count,
  trailing,
  className,
  ...props
}: Omit<ComponentProps<'button'>, 'title'> & {
  icon: ReactNode
  title: ReactNode
  selected?: boolean
  count?: number
  trailing?: ReactNode
}) {
  return (
    <button
      type="button"
      aria-current={selected ? 'page' : undefined}
      className={cn(
        SIDEBAR_ROW,
        'px-(--sidebar-row-content-inset)',
        selected ? SIDEBAR_ROW_SELECTED : SIDEBAR_ROW_IDLE,
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          'flex shrink-0 items-center',
          selected
            ? 'text-sidebar-foreground'
            : 'text-sidebar-muted-foreground group-hover:text-sidebar-foreground',
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{title}</span>
      {trailing ??
        (count !== undefined ? (
          <RowCount count={count} selected={selected} />
        ) : null)}
    </button>
  )
}

/** A collapsible group of rows under a plain muted heading (Codex's "Projects"). */
export function SidebarSection({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  const [open, setOpen] = useState(true)
  return (
    <div className="mt-4">
      <div className="group flex h-8 items-center gap-1 rounded-lg pr-1">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          className="flex h-8 items-center gap-1 rounded-lg px-(--sidebar-row-content-inset) text-[13px] font-normal text-sidebar-muted-foreground outline-none hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          {title}
          <ChevronDownIcon
            className={cn(
              'size-3.5 transition-[opacity,transform]',
              open ? 'opacity-0 group-hover:opacity-100' : '-rotate-90',
            )}
          />
        </button>
        <span className="flex-1" />
        {action ? (
          <span className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
            {action}
          </span>
        ) : null}
      </div>
      {open ? <div className="flex flex-col gap-0.5">{children}</div> : null}
    </div>
  )
}

/** The sidebar's heading: the team's name, or "Settings" (Codex's "Codex"),
 *  past the panel's rounded corner. */
export function SidebarHeading({ children }: { children: ReactNode }) {
  return (
    <div className="shrink-0 px-(--sidebar-content-inset) pt-(--radius-xl) pb-2">
      <h2 className="flex h-9 items-center px-(--sidebar-row-content-inset) text-base font-semibold tracking-tight text-sidebar-foreground">
        <span className="truncate">{children}</span>
      </h2>
    </div>
  )
}
