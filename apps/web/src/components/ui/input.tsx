import type * as React from 'react'

import { cn } from '@/lib/utils'

/** Single-line text field: a quiet filled well with a faint border and a
 *  soft focus ring (Otter Mail's). */
function Input({
  className,
  type = 'text',
  size = 'default',
  font = 'default',
  ...props
}: Omit<React.ComponentProps<'input'>, 'size'> & {
  size?: 'sm' | 'default' | 'lg'
  /** Monospace with tabular digits, for keys, codes and slugs. */
  font?: 'default' | 'mono'
}) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-8 w-full min-w-0 rounded-lg border border-border/70 bg-surface-raised/60 px-[calc(--spacing(2.75)-1px)] text-sm text-foreground outline-none transition-[box-shadow,border-color,background-color] placeholder:text-placeholder focus-visible:border-focus-ring/60 focus-visible:bg-canvas focus-visible:ring-[3px] focus-visible:ring-focus-ring/16 disabled:opacity-64 aria-invalid:border-destructive/36',
        size === 'sm' && 'h-7 px-[calc(--spacing(2.5)-1px)] text-[13px]',
        size === 'lg' && 'h-10 px-3 text-[15px]',
        font === 'mono' && 'font-mono tabular-nums',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
