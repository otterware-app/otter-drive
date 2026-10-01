import type { LucideIcon } from 'lucide-react'
import type * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * Centered placeholder for an empty screen (Otter Mail's, in the Codex
 * style): an outline icon, a large quiet title, a line of explanation, and
 * optional actions.
 */
function EmptyState({
  title,
  description,
  actions,
  icon: Icon,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<'div'>, 'title'> & {
  title?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  icon?: LucideIcon
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        'flex min-w-0 flex-col items-center justify-center gap-4 p-6 text-center text-balance',
        className,
      )}
      {...props}
    >
      {Icon ? (
        <Icon
          className="size-10 text-icon-muted"
          strokeWidth={1.25}
          aria-hidden
        />
      ) : null}
      {title || description ? (
        <div className="flex max-w-md flex-col items-center gap-2">
          {title ? (
            <h2 className="text-2xl leading-[30px] font-normal tracking-[-0.01em] text-foreground">
              {title}
            </h2>
          ) : null}
          {description ? (
            <p className="text-sm leading-5 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      ) : null}
      {actions ? (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {actions}
        </div>
      ) : null}
      {children}
    </div>
  )
}

export { EmptyState }
