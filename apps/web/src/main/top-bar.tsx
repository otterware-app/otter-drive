import type { ReactNode } from 'react'
import { IconButton } from '@/components/ui/button'
import { HintTooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { shortcutLabel } from './keybindings/commands'

/**
 * Every column owns the slice of the title band above it, so the pane
 * separators run all the way up (Otter Mail's top-bar.tsx). These pieces fill
 * those slices.
 */

/**
 * The sidebar toggle's icon: ChatGPT's and Linear's soft frame, in Lucide's
 * strokes. The pane is filled while it's open, a thin bar while it's closed.
 */
export function PaneIcon({
  side,
  open,
  className,
}: {
  side: 'left' | 'right'
  open: boolean
  className?: string
}) {
  const x = side === 'left' ? 8 : 16
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <rect x="3" y="4" width="18" height="16" rx="4" />
      {open ? (
        <rect
          x={x - 1.5}
          y="7.5"
          width="3"
          height="9"
          rx="1"
          fill="currentColor"
          strokeWidth="1.5"
        />
      ) : (
        <path d={`M${x} 8v8`} strokeWidth="1.5" />
      )}
    </svg>
  )
}

/**
 * The sidebar toggle, pinned at one window position over the rail (Otter
 * Code's SidebarControl), so nothing moves when the sidebar opens or closes.
 */
export function SidebarControl({
  sidebarOpen,
  onToggleSidebar,
}: {
  sidebarOpen: boolean
  onToggleSidebar: () => void
}) {
  return (
    <div className="pointer-events-none fixed top-0 left-(--workspace-controls-left) z-40 flex h-(--workspace-topbar-height) items-center">
      <HintTooltip
        label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
        hint={shortcutLabel('sidebar.toggle')}
        side="bottom"
      >
        <IconButton
          label="Toggle sidebar"
          aria-expanded={sidebarOpen}
          className="pointer-events-auto"
          onClick={onToggleSidebar}
        >
          <PaneIcon side="left" open={sidebarOpen} className="size-4" />
        </IconButton>
      </HintTooltip>
    </div>
  )
}

/** A pane's slice of the title band: its heading and controls. */
export function TitleBand({
  className,
  children,
}: {
  className?: string
  children?: ReactNode
}) {
  return (
    <div
      data-toolbar=""
      className={cn(
        'flex h-(--workspace-topbar-height) shrink-0 items-center gap-1 px-4',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** The wordmark in Otter Code's style: brand word, then the product muted. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-baseline gap-1 text-sm font-medium tracking-tight whitespace-nowrap select-none',
        className,
      )}
    >
      <span className="text-foreground">Otter</span>
      <span className="truncate text-muted-foreground">Drive</span>
    </span>
  )
}

/** Otter Drive's box mark (favicon.svg), in the current text color. */
export function DriveMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={cn('shrink-0', className)}>
      <rect width="64" height="64" rx="15" className="fill-foreground" />
      <g
        fill="none"
        className="stroke-canvas"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3.5"
      >
        <path d="m48 21-16-9-16 9v22l16 9 16-9z" />
        <path d="m16 21 16 9 16-9" />
        <path d="M32 52V30" />
      </g>
    </svg>
  )
}
