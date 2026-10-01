import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from 'react'

/**
 * The window's panes (Otter Mail's home-view.tsx): drag-resizable widths
 * kept in localStorage, a zero-width seam to drag them by, and the few
 * remembered layout switches.
 */

function readNumber(key: string): number | null {
  try {
    const saved = Number(window.localStorage.getItem(key))
    return Number.isFinite(saved) && saved > 0 ? saved : null
  } catch {
    return null
  }
}

/**
 * Drag-resizable pane width persisted to localStorage. `dir` -1 is for panes
 * right of their handle. The drag drives the DOM directly and commits to
 * React state once, on release, so the panes don't re-render every frame.
 */
export function useStoredWidth(
  key: string,
  initial: number,
  min: number,
  max: number,
  dir: 1 | -1 = 1,
) {
  const [width, setWidth] = useState(initial)
  const widthRef = useRef(width)
  widthRef.current = width
  const paneRef = useRef<HTMLDivElement>(null)
  // The animated frame around a collapsible pane: follows the drag with its
  // open/close transition switched off.
  const frameRef = useRef<HTMLDivElement>(null)

  // Server HTML uses the default; the saved width lands right after hydration.
  useEffect(() => {
    const saved = readNumber(key)
    if (saved !== null && saved >= min && saved <= max) setWidth(saved)
  }, [key, min, max])

  const start = (event: ReactPointerEvent) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = widthRef.current
    let latest = startWidth
    let frame = 0
    const apply = () => {
      frame = 0
      if (paneRef.current) paneRef.current.style.width = `${latest}px`
      if (frameRef.current) frameRef.current.style.width = `${latest}px`
    }
    const move = (moveEvent: PointerEvent) => {
      latest = Math.min(
        max,
        Math.max(min, startWidth + dir * (moveEvent.clientX - startX)),
      )
      if (!frame) frame = requestAnimationFrame(apply)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      if (frame) cancelAnimationFrame(frame)
      apply()
      delete document.body.dataset.resizing
      if (frameRef.current) frameRef.current.style.transitionProperty = ''
      widthRef.current = latest
      setWidth(latest)
      window.localStorage.setItem(key, String(latest))
    }
    document.body.dataset.resizing = ''
    if (frameRef.current) frameRef.current.style.transitionProperty = 'none'
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return { width, start, paneRef, frameRef }
}

/**
 * Zero-width in the layout: panes meet on a tone change (or their own faint
 * divider), and the grab area is an invisible strip centered on the seam
 * that shows a hairline on hover.
 */
export function PaneResizer({
  onPointerDown,
  label,
}: {
  onPointerDown: (event: ReactPointerEvent) => void
  label: string
}) {
  return (
    <div className="relative z-20 w-0 shrink-0">
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={label}
        onPointerDown={onPointerDown}
        className="group absolute inset-y-0 -left-[3px] flex w-1.5 cursor-col-resize justify-center"
      >
        <div className="w-px transition-colors group-hover:bg-input" />
      </div>
    </div>
  )
}

/** A remembered on/off switch (sidebar shown, full-width viewer…). */
export function useStoredBoolean(key: string, initial: boolean) {
  const [value, setValue] = useState(initial)
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(key)
      if (saved === 'true' || saved === 'false') setValue(saved === 'true')
    } catch {
      // Storage blocked: the default stands.
    }
  }, [key])
  const update = useCallback(
    (next: boolean | ((current: boolean) => boolean)) => {
      setValue((current) => {
        const resolved = typeof next === 'function' ? next(current) : next
        try {
          window.localStorage.setItem(key, String(resolved))
        } catch {
          // The switch still works for this visit.
        }
        return resolved
      })
    },
    [key],
  )
  return [value, update] as const
}

const NARROW_QUERY = '(max-width: 767px)'

function subscribeNarrow(onChange: () => void) {
  const query = window.matchMedia(NARROW_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/** A phone-sized window: one pane at a time, the sidebar as a drawer. */
export function useIsNarrow(): boolean {
  return useSyncExternalStore(
    subscribeNarrow,
    () => window.matchMedia(NARROW_QUERY).matches,
    () => false,
  )
}
