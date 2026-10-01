import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/*
 * Settings layout (Otter Mail's, after ChatGPT's): one centered column. The
 * page title, page description, section titles and descriptions share the
 * card's left edge; inside a card every row's text starts 16px in and every
 * control ends 16px from the right.
 */

/** Shared settings card surface, with separators between rows. */
export function SettingsGroup({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="settings-group"
      className={cn(
        'relative overflow-visible rounded-xl border border-border/60 bg-card text-foreground',
        '[&>*+*]:border-t [&>*+*]:border-border/40',
        // Row hovers and selections follow the card's corners.
        '[&>*:first-child]:rounded-t-[11px] [&>*:last-child]:rounded-b-[11px]',
        className,
      )}
      {...props}
    />
  )
}

/** A section's title (and optional description) above its card. */
export function SettingsSectionHeader({
  title,
  description,
  action,
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    // Text outside the cards lines up with the text inside them (Linear):
    // the cards' 1px border + 16px padding.
    <div className="mb-3 flex min-h-7 items-center justify-between gap-4 px-[17px]">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
          {title}
        </h2>
        {description ? (
          <p className="mt-0.5 text-[13px] leading-[18px] text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action ? (
        <div className="flex shrink-0 items-center gap-2">{action}</div>
      ) : null}
    </div>
  )
}

/** A titled group of rows. "plain" leaves the children uncarded. */
export function SettingsSection({
  title,
  description,
  headerAction,
  variant = 'grouped',
  children,
  className,
  ...props
}: Omit<ComponentProps<'section'>, 'title'> & {
  title: ReactNode
  description?: ReactNode
  headerAction?: ReactNode
  variant?: 'grouped' | 'plain'
  children: ReactNode
}) {
  return (
    <section className={className} {...props}>
      <SettingsSectionHeader
        title={title}
        description={description}
        action={headerAction}
      />
      {variant === 'grouped' ? (
        <SettingsGroup>{children}</SettingsGroup>
      ) : (
        children
      )}
    </section>
  )
}

/**
 * One setting: title + description on the left, the control on the right.
 * Children render below the row (expanded editors, results).
 */
export function SettingsRow({
  title,
  description,
  control,
  children,
  className,
  ...props
}: Omit<ComponentProps<'div'>, 'title'> & {
  title: ReactNode
  description?: ReactNode
  control?: ReactNode
  children?: ReactNode
}) {
  return (
    <div
      data-slot="settings-row"
      className={cn(
        '@container/settings-row px-4',
        children ? 'pt-2.5 pb-3' : 'py-2.5',
        className,
      )}
      {...props}
    >
      <div className="flex min-h-9 flex-col gap-3 @min-[30rem]/settings-row:flex-row @min-[30rem]/settings-row:items-center @min-[30rem]/settings-row:gap-8">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-normal text-foreground">{title}</h3>
          {description ? (
            <p className="mt-0.5 max-w-[30rem] text-[13px] leading-[18px] text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {control ? (
          <div
            data-slot="settings-row-control"
            className="flex min-w-0 shrink-0 items-center gap-2 @min-[30rem]/settings-row:justify-end"
          >
            {control}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  )
}

/** A scrollable page: the pane's title (and a line of description) over
 *  its sections, in the settings column. */
export function SettingsPageContainer({
  title,
  description,
  action,
  className,
  children,
}: {
  title: ReactNode
  description?: ReactNode
  /** Beside the title, right-aligned with the cards' edge. */
  action?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div
        className={cn(
          'mx-auto w-full max-w-[47rem] space-y-10 px-6 pt-14 pb-20',
          className,
        )}
      >
        <header className="flex items-end justify-between gap-4 px-[17px]">
          <div className="min-w-0">
            <h1 className="text-[26px] leading-8 font-medium tracking-[-0.01em] text-foreground">
              {title}
            </h1>
            {description ? (
              <p className="mt-1.5 text-sm text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          {action ? (
            <div className="flex shrink-0 items-center gap-2">{action}</div>
          ) : null}
        </header>
        {children}
      </div>
    </div>
  )
}

/** A secret or link shown once, to copy (monospace, selectable). */
export function CopyField({
  value,
  onCopy,
}: {
  value: string
  onCopy: () => void
}) {
  return (
    <div className="mt-3 flex items-center gap-2 rounded-lg border border-border/70 bg-surface-raised/60 py-1 ps-3 pe-1">
      <code
        data-selectable=""
        className="min-w-0 flex-1 truncate font-mono text-[13px] text-foreground"
      >
        {value}
      </code>
      <button
        type="button"
        onClick={onCopy}
        className="h-7 shrink-0 rounded-md px-2.5 text-[13px] text-foreground outline-none hover:bg-accent-surface focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        Copy
      </button>
    </div>
  )
}
