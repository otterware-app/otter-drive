import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

// Otter Mail's in-page tooltips: a quiet bubble after a short delay, shown at
// once while moving between neighbouring controls.
const TOOLTIP_DELAY_MS = 500
/** Moving between neighbouring controls within this window shows instantly. */
const TOOLTIP_GRACE_MS = 300
const TOOLTIP_GAP = 6
const VIEWPORT_MARGIN = 6
let lastTooltipClosedAt = 0

type TooltipSide = 'top' | 'bottom' | 'right'
type TooltipPlacement = { top: number; left: number; side: TooltipSide }

/** Hover/focus hint for a control. Wraps its child without adding layout. */
export function HintTooltip({
  label,
  hint,
  side = 'top',
  children,
}: {
  label: string
  /** A keyboard shortcut or short aside, shown muted after the label. */
  hint?: string | undefined
  /** "right" for a control in the rail down the window's edge. */
  side?: TooltipSide
  children: ReactNode
}) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const [placement, setPlacement] = useState<TooltipPlacement | null>(null)
  const timer = useRef<number | null>(null)
  const popupRef = useRef<HTMLDivElement>(null)

  const clearTimer = () => {
    if (timer.current != null) window.clearTimeout(timer.current)
    timer.current = null
  }
  const open = (target: Element | null) => {
    if (!target) return
    clearTimer()
    const reveal = () => setAnchor(target.getBoundingClientRect())
    if (Date.now() - lastTooltipClosedAt < TOOLTIP_GRACE_MS) reveal()
    else timer.current = window.setTimeout(reveal, TOOLTIP_DELAY_MS)
  }
  const close = () => {
    clearTimer()
    setAnchor((current) => {
      if (current) lastTooltipClosedAt = Date.now()
      return null
    })
    setPlacement(null)
  }

  useEffect(() => clearTimer, [])

  // Place against the trigger once the bubble is measured: preferred side,
  // flipped when it would leave the window, clamped horizontally.
  useLayoutEffect(() => {
    const popup = popupRef.current
    if (!anchor || !popup) return
    const { width, height } = popup.getBoundingClientRect()
    if (side === 'right') {
      const middle = anchor.top + anchor.height / 2 - height / 2
      const top = Math.min(
        Math.max(VIEWPORT_MARGIN, middle),
        window.innerHeight - height - VIEWPORT_MARGIN,
      )
      setPlacement({ top, left: anchor.right + TOOLTIP_GAP, side })
      return
    }
    const fitsTop = anchor.top - TOOLTIP_GAP - height >= VIEWPORT_MARGIN
    const fitsBottom =
      anchor.bottom + TOOLTIP_GAP + height <=
      window.innerHeight - VIEWPORT_MARGIN
    const resolved =
      side === 'top'
        ? fitsTop || !fitsBottom
          ? 'top'
          : 'bottom'
        : fitsBottom || !fitsTop
          ? 'bottom'
          : 'top'
    const top =
      resolved === 'top'
        ? anchor.top - TOOLTIP_GAP - height
        : anchor.bottom + TOOLTIP_GAP
    const centered = anchor.left + anchor.width / 2 - width / 2
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, centered),
      window.innerWidth - width - VIEWPORT_MARGIN,
    )
    setPlacement({ top, left, side: resolved })
  }, [anchor, side])

  // Any scroll or window change invalidates the anchor rect.
  useEffect(() => {
    if (!anchor) return
    const dismiss = () => close()
    window.addEventListener('scroll', dismiss, true)
    window.addEventListener('resize', dismiss)
    window.addEventListener('blur', dismiss)
    return () => {
      window.removeEventListener('scroll', dismiss, true)
      window.removeEventListener('resize', dismiss)
      window.removeEventListener('blur', dismiss)
    }
  }, [anchor])

  const triggerOf = (event: { currentTarget: HTMLElement }) =>
    event.currentTarget.firstElementChild

  return (
    <>
      <span
        className="contents"
        onPointerOver={(event: PointerEvent<HTMLSpanElement>) => {
          if (event.pointerType === 'touch') return
          const from = event.relatedTarget
          if (from instanceof Node && event.currentTarget.contains(from)) return
          open(triggerOf(event))
        }}
        onPointerOut={(event: PointerEvent<HTMLSpanElement>) => {
          const to = event.relatedTarget
          if (to instanceof Node && event.currentTarget.contains(to)) return
          close()
        }}
        onPointerDown={close}
        onFocus={(event: FocusEvent<HTMLSpanElement>) => {
          if (
            event.target instanceof HTMLElement &&
            event.target.matches(':focus-visible')
          ) {
            open(triggerOf(event))
          }
        }}
        onBlur={close}
        onKeyDown={(event) => {
          if (event.key === 'Escape') close()
        }}
      >
        {children}
      </span>
      {anchor
        ? createPortal(
            <div
              ref={popupRef}
              role="tooltip"
              style={
                placement
                  ? { top: placement.top, left: placement.left }
                  : { top: -9999, left: -9999, visibility: 'hidden' }
              }
              className={cn(
                'tooltip-in pointer-events-none fixed z-[140] flex max-w-80 items-center gap-1.5 rounded-lg border border-border/60 bg-popover px-2 py-1 text-xs leading-snug whitespace-nowrap text-popover-foreground shadow-lg/10',
                placement?.side === 'bottom'
                  ? 'origin-top'
                  : placement?.side === 'right'
                    ? 'origin-left'
                    : 'origin-bottom',
              )}
            >
              <span>{label}</span>
              {hint ? (
                <span className="text-muted-foreground">{hint}</span>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

/** Keyboard hint chip. */
export function Kbd({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <kbd
      className={cn(
        'pointer-events-none inline-flex h-5 min-w-5 items-center justify-center gap-1 rounded bg-foreground/[0.08] px-1 font-sans text-xs font-medium text-foreground select-none [&_svg]:size-3',
        className,
      )}
    >
      {children}
    </kbd>
  )
}
