import { useEffect, useState, type ReactNode } from 'react'
import { MoonIcon, SunIcon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { IconButton } from '@/components/ui/button'
import { HintTooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { DriveMark, Wordmark } from '../top-bar'
import { DocField } from './doc-field'

/**
 * The pages before and around signing in (Otter Mail's setup): the window's
 * grain frame with the wordmark, and one inset panel with a quiet field of
 * documents drifting behind a centered step.
 */
export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  /** Under the step: a way back, a way elsewhere. */
  footer?: ReactNode
}) {
  return (
    <div className="surface-grain flex h-dvh flex-col bg-sidebar-surface text-foreground">
      <div className="flex h-(--workspace-topbar-height) shrink-0 items-center justify-between px-4">
        <Wordmark />
        <ThemeToggle />
      </div>
      <div className="relative isolate mx-1 mb-1 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-(--panel-edge) bg-canvas">
        <DocField />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center px-6 py-10">
            <div className="flex w-full max-w-[22rem] flex-col items-center motion-safe:animate-[onboarding-in_360ms_var(--ease-drawer)]">
              <DriveMark className="mb-6 size-14 rounded-[23%] shadow-[0_12px_32px_-12px_rgb(0_0_0/0.5)]" />
              <div className="mb-7 flex flex-col items-center gap-2 text-center text-balance">
                <h1 className="text-[28px] leading-9 font-medium tracking-[-0.015em] text-foreground">
                  {title}
                </h1>
                {description ? (
                  <p className="text-[15px] leading-6 text-muted-foreground">
                    {description}
                  </p>
                ) : null}
              </div>
              <div className="w-full">{children}</div>
              {footer ? (
                <div className="mt-6 text-center text-[13px] text-muted-foreground">
                  {footer}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** A form in the auth panel: fields stacked with room to breathe. */
export function AuthForm({
  className,
  ...props
}: React.ComponentProps<'form'>) {
  // Opaque fields, so the drifting documents don't show through them.
  return (
    <form
      className={cn(
        'flex flex-col gap-4 [&_input]:bg-canvas [&_input]:focus-visible:bg-canvas',
        className,
      )}
      {...props}
    />
  )
}

/** A text link in the auth pages' footers. */
export function AuthLink({
  href,
  children,
}: {
  href: string
  children: ReactNode
}) {
  return (
    <a
      href={href}
      className="text-foreground underline-offset-2 outline-none hover:underline focus-visible:underline"
    >
      {children}
    </a>
  )
}

/** A short status in the panel: an error, or what happened. */
export function AuthMessage({
  tone = 'default',
  children,
}: {
  tone?: 'default' | 'error' | 'success'
  children: ReactNode
}) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'rounded-lg px-3 py-2 text-[13px] leading-5',
        tone === 'error'
          ? 'bg-error-surface text-error-foreground'
          : tone === 'success'
            ? 'bg-success/10 text-success-foreground'
            : 'bg-surface-raised/70 text-muted-foreground',
      )}
    >
      {children}
    </p>
  )
}

function ThemeToggle() {
  const [mounted, setMounted] = useState(false)
  const { resolvedTheme, setTheme } = useTheme()
  useEffect(() => setMounted(true), [])
  const dark = mounted && resolvedTheme === 'dark'
  return (
    <HintTooltip
      label={dark ? 'Light appearance' : 'Dark appearance'}
      side="bottom"
    >
      <IconButton
        label={dark ? 'Use light theme' : 'Use dark theme'}
        disabled={!mounted}
        onClick={() => setTheme(dark ? 'light' : 'dark')}
      >
        {dark ? (
          <SunIcon className="size-4" />
        ) : (
          <MoonIcon className="size-4" />
        )}
      </IconButton>
    </HintTooltip>
  )
}
