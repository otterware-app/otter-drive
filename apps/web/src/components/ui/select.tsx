import { Select as SelectPrimitive } from '@base-ui/react/select'
import { CheckIcon, ChevronDownIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Otter Mail's select (Base UI underneath). `RowSelect` is the everyday one:
 * a compact pill sized to its value, its options given as a list.
 */

export type SelectOption = { value: string; label: string }

export function RowSelect({
  value,
  onValueChange,
  options,
  placeholder,
  ariaLabel,
  id,
  className,
  disabled,
  variant = 'pill',
}: {
  value: string | undefined
  onValueChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  ariaLabel?: string
  id?: string
  className?: string
  disabled?: boolean
  /** "pill" for settings rows; "field" fills its form column. */
  variant?: 'pill' | 'field'
}) {
  return (
    // null keeps the Select controlled (showing the placeholder) while the
    // value loads.
    <SelectPrimitive.Root
      value={value ?? null}
      items={options}
      disabled={disabled ?? false}
      onValueChange={(next) => {
        if (typeof next === 'string') onValueChange(next)
      }}
    >
      <SelectPrimitive.Trigger
        id={id}
        aria-label={ariaLabel}
        data-slot="select-trigger"
        className={cn(
          'relative inline-flex items-center justify-between rounded-lg border text-left text-foreground outline-none select-none focus-visible:border-focus-ring/60 focus-visible:ring-[3px] focus-visible:ring-focus-ring/16 data-disabled:pointer-events-none data-disabled:opacity-64 data-placeholder:text-placeholder',
          variant === 'pill'
            ? 'h-7 max-w-64 gap-1.5 border-border bg-transparent ps-2.5 pe-2 text-[13px] hover:bg-accent-surface data-popup-open:bg-accent-surface'
            : 'h-8 w-full min-w-36 gap-2 border-border/70 bg-surface-raised/60 px-[calc(--spacing(2.75)-1px)] text-sm hover:bg-surface-raised',
          className,
        )}
      >
        <SelectPrimitive.Value
          placeholder={placeholder ?? 'Loading…'}
          className="min-w-0 flex-1 truncate"
        />
        <SelectPrimitive.Icon
          render={
            <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
          }
        />
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner
          className="z-[130] outline-none"
          sideOffset={4}
          alignItemWithTrigger={false}
          collisionPadding={8}
        >
          <SelectPrimitive.Popup
            data-slot="select-content"
            className="dropdown-glass max-h-(--available-height) min-w-(--anchor-width) origin-(--transform-origin) overflow-y-auto rounded-xl p-1.5 text-foreground shadow-[0_16px_40px_-18px_rgb(0_0_0/55%)] outline-none data-starting-style:animate-[menu-in_120ms_ease-out] dark:shadow-[0_18px_44px_-18px_rgb(0_0_0/80%)]"
          >
            <SelectPrimitive.List>
              {options.map((option) => (
                <SelectPrimitive.Item
                  key={option.value}
                  value={option.value}
                  className="relative flex min-h-8 cursor-pointer items-center gap-2 rounded-lg py-1 ps-2.5 pe-8 text-sm outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-64 data-highlighted:bg-foreground/[0.07]"
                >
                  <SelectPrimitive.ItemText>
                    {option.label}
                  </SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator className="absolute end-2.5 flex size-4 items-center justify-center">
                    <CheckIcon className="size-4 text-foreground" />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.List>
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}
