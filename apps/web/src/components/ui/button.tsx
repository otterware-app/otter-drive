import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

/**
 * Push button in the app's control style (Otter Mail's, from Otter Code):
 * rounded, faint border, one flat solid primary. No pressed scale: a desktop
 * button stays put.
 */
const buttonVariants = cva(
  'relative inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border font-normal whitespace-nowrap outline-none transition-[box-shadow,background-color,color] focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-1 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-64 aria-disabled:pointer-events-none aria-disabled:opacity-64 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    defaultVariants: { size: 'default', variant: 'outline' },
    variants: {
      variant: {
        /** Solid call to action (upload, confirm), flat in the primary. */
        accent:
          'border-transparent bg-primary text-primary-foreground hover:bg-primary/88',
        destructive:
          'border-transparent bg-destructive text-white hover:bg-destructive/88',
        /** Quiet pill with a faint border. */
        outline:
          'border-border bg-transparent text-foreground hover:bg-accent-surface data-popup-open:bg-accent-surface',
        /** Quiet control that only shows a surface on hover. */
        ghost:
          'border-transparent text-foreground hover:bg-accent-surface data-popup-open:bg-accent-surface',
        /** Ghost in the muted tone, brightening on hover (toolbar icons). */
        'ghost-muted':
          'border-transparent text-muted-foreground hover:bg-accent-surface hover:text-foreground data-popup-open:bg-accent-surface data-popup-open:text-foreground',
        secondary:
          'border-transparent bg-accent-surface text-foreground hover:bg-accent-surface/80',
        'ghost-destructive':
          'border-transparent text-destructive-foreground hover:bg-destructive/10 [&_svg]:text-destructive-foreground',
      },
      size: {
        xs: "h-6 gap-1 px-[calc(--spacing(2)-1px)] text-xs [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-7 px-[calc(--spacing(2.5)-1px)] text-[13px] [&_svg:not([class*='size-'])]:size-3.5",
        default:
          "h-8 px-[calc(--spacing(3)-1px)] text-sm [&_svg:not([class*='size-'])]:size-4",
        lg: "h-10 px-5 text-[15px] [&_svg:not([class*='size-'])]:size-4",
        'icon-xs': "size-6 px-0 [&_svg:not([class*='size-'])]:size-3.5",
        'icon-sm': "size-7 px-0 [&_svg:not([class*='size-'])]:size-4",
        icon: "size-8 px-0 [&_svg:not([class*='size-'])]:size-4",
      },
    },
  },
)

type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants>

function Button({ className, variant, size, type, ...props }: ButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}

/** Ghost icon button used across the chrome (title bands, rows, rails). */
function IconButton({
  label,
  active,
  className,
  children,
  ...props
}: React.ComponentProps<'button'> & { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      data-slot="icon-button"
      className={cn(
        buttonVariants({
          variant: active ? 'secondary' : 'ghost-muted',
          size: 'icon-sm',
        }),
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export { Button, IconButton, buttonVariants, type ButtonProps }
