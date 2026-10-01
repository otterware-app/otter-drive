/** The document's place while it loads: a quiet page of skeleton lines. */
export function ContentLoading() {
  return (
    <div
      role="status"
      aria-label="Loading document"
      className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-8 pt-12"
    >
      <div className="h-6 w-2/5 animate-skeleton rounded-full bg-secondary" />
      <div className="mt-3 h-3 w-full animate-skeleton rounded-full bg-accent-surface" />
      <div className="h-3 w-11/12 animate-skeleton rounded-full bg-accent-surface" />
      <div className="h-3 w-4/5 animate-skeleton rounded-full bg-accent-surface" />
      <div className="h-3 w-3/5 animate-skeleton rounded-full bg-accent-surface" />
    </div>
  )
}
