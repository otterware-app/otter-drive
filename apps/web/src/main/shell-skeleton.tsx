import { DocumentListSkeleton } from './drive/document-list'

/**
 * The window before the session is known (and what the server renders): the
 * frame, the panel and a list of placeholder rows, so signing in lands
 * without a jump.
 */
export function ShellSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading Otter Drive"
      className="surface-grain flex h-dvh bg-sidebar-surface"
    >
      <div className="w-(--workspace-rail-width) shrink-0" />
      <div className="relative isolate flex min-w-0 flex-1 pr-1 pb-1">
        <div
          aria-hidden
          className="pointer-events-none absolute top-(--workspace-topbar-height) right-1 bottom-1 left-0 -z-10 rounded-xl border border-(--panel-edge) bg-canvas"
        />
        <div className="hidden w-[244px] shrink-0 md:block" />
        <div className="w-full shrink-0 pt-(--workspace-topbar-height) md:w-[360px]">
          <div className="pt-[9px]">
            <DocumentListSkeleton />
          </div>
        </div>
      </div>
    </div>
  )
}
