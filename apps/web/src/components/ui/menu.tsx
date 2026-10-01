import type * as React from 'react'
import { ContextMenu as ContextPrimitive } from '@base-ui/react/context-menu'
import { Menu as MenuPrimitive } from '@base-ui/react/menu'
import { CheckIcon, ChevronRightIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Otter Mail's menus (Base UI underneath): frosted floating cards with 14px
 * corners and 32px rows that light up in a rounded soft highlight.
 */

const POPUP =
  'dropdown-glass max-h-(--available-height) min-w-44 origin-(--transform-origin) overflow-y-auto rounded-xl p-1.5 text-foreground shadow-[0_16px_40px_-18px_rgb(0_0_0/55%)] outline-none data-starting-style:animate-[menu-in_120ms_ease-out] dark:shadow-[0_18px_44px_-18px_rgb(0_0_0/80%)]'

const ROW =
  "relative flex min-h-8 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1 text-sm outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-64 data-highlighted:bg-foreground/[0.07] data-highlighted:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground"

const DESTRUCTIVE =
  "text-destructive-foreground [&_svg:not([class*='text-'])]:text-destructive-foreground"

/** Menus are non-modal: outside clicks still dismiss them, and the page
 *  behind stays scrollable, as in Otter Mail. */
function DropdownMenu(props: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root modal={false} {...props} />
}

function DropdownMenuTrigger(props: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />
}

function DropdownMenuContent({
  align = 'start',
  alignOffset = 0,
  side = 'bottom',
  sideOffset = 4,
  className,
  ...props
}: MenuPrimitive.Popup.Props &
  Pick<
    MenuPrimitive.Positioner.Props,
    'align' | 'alignOffset' | 'side' | 'sideOffset'
  >) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        className="z-[130] outline-none"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        collisionPadding={8}
      >
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          className={cn(POPUP, className)}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  )
}

type ItemExtras = {
  icon?: React.ReactNode
  /** Shortcut shown right-aligned. */
  accelerator?: string | undefined
  variant?: 'default' | 'destructive'
}

function ItemBody({
  icon,
  accelerator,
  children,
}: Omit<ItemExtras, 'variant'> & { children?: React.ReactNode }) {
  return (
    <>
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {accelerator ? (
        <kbd className="ms-auto font-sans text-xs tracking-widest text-muted-foreground">
          {accelerator}
        </kbd>
      ) : null}
    </>
  )
}

function DropdownMenuItem({
  className,
  icon,
  accelerator,
  variant = 'default',
  children,
  ...props
}: MenuPrimitive.Item.Props & ItemExtras) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-variant={variant}
      className={cn(ROW, variant === 'destructive' && DESTRUCTIVE, className)}
      {...props}
    >
      <ItemBody icon={icon} accelerator={accelerator}>
        {children}
      </ItemBody>
    </MenuPrimitive.Item>
  )
}

/** A menu row that is a real link (opens with the keyboard, middle-click…). */
function DropdownMenuLinkItem({
  className,
  icon,
  accelerator,
  variant = 'default',
  children,
  ...props
}: MenuPrimitive.LinkItem.Props & ItemExtras) {
  return (
    <MenuPrimitive.LinkItem
      data-slot="dropdown-menu-item"
      className={cn(ROW, variant === 'destructive' && DESTRUCTIVE, className)}
      {...props}
    >
      <ItemBody icon={icon} accelerator={accelerator}>
        {children}
      </ItemBody>
    </MenuPrimitive.LinkItem>
  )
}

/** A row that shows a check when it's the current choice (a checkbox item
 *  to assistive tech; it closes the menu like any other row). */
function DropdownMenuCheckItem({
  checked,
  icon,
  accelerator,
  children,
  className,
  ...props
}: Omit<MenuPrimitive.CheckboxItem.Props, 'checked'> &
  Omit<ItemExtras, 'variant'> & { checked: boolean }) {
  return (
    <MenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-item"
      checked={checked}
      closeOnClick
      className={cn(ROW, 'pe-8', className)}
      {...props}
    >
      <ItemBody icon={icon} accelerator={accelerator}>
        {children}
      </ItemBody>
      <MenuPrimitive.CheckboxItemIndicator className="absolute end-2.5 top-1/2 flex -translate-y-1/2">
        <CheckIcon className="size-3.5 text-foreground" />
      </MenuPrimitive.CheckboxItemIndicator>
    </MenuPrimitive.CheckboxItem>
  )
}

function DropdownMenuGroup(props: MenuPrimitive.Group.Props) {
  return <MenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
}

/** A quiet heading in a menu (not a group label, so it needs no group). */
function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dropdown-menu-label"
      className={cn(
        'px-2.5 pt-1.5 pb-1 text-[13px] text-muted-foreground select-none',
        className,
      )}
      {...props}
    />
  )
}

function DropdownMenuSeparator({
  className,
  ...props
}: MenuPrimitive.Separator.Props) {
  return (
    <MenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn('mx-2.5 my-1 h-px bg-border/70', className)}
      {...props}
    />
  )
}

/** Submenu with a text trigger (`label`), like a native menu's. */
function DropdownMenuSub({
  label,
  icon,
  children,
}: {
  label: React.ReactNode
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <MenuPrimitive.SubmenuRoot>
      <MenuPrimitive.SubmenuTrigger
        className={cn(ROW, 'data-popup-open:bg-foreground/[0.07]')}
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <ChevronRightIcon className="ms-auto size-3.5 text-muted-foreground" />
      </MenuPrimitive.SubmenuTrigger>
      <MenuPrimitive.Portal>
        <MenuPrimitive.Positioner
          className="z-[130] outline-none"
          side="right"
          align="start"
          sideOffset={4}
          alignOffset={-6}
          collisionPadding={8}
        >
          <MenuPrimitive.Popup className={POPUP}>
            {children}
          </MenuPrimitive.Popup>
        </MenuPrimitive.Positioner>
      </MenuPrimitive.Portal>
    </MenuPrimitive.SubmenuRoot>
  )
}

/*
 * Right-click menus with the same look. The trigger adds no box
 * (display: contents) unless it renders its own element.
 */
function ContextMenu(props: ContextPrimitive.Root.Props) {
  return <ContextPrimitive.Root {...props} />
}

function ContextMenuTrigger({
  className,
  ...props
}: ContextPrimitive.Trigger.Props) {
  return (
    <ContextPrimitive.Trigger
      className={cn(props.render ? undefined : 'contents', className)}
      {...props}
    />
  )
}

function ContextMenuContent({
  className,
  ...props
}: ContextPrimitive.Popup.Props) {
  return (
    <ContextPrimitive.Portal>
      <ContextPrimitive.Positioner
        className="z-[130] outline-none"
        collisionPadding={8}
      >
        <ContextPrimitive.Popup className={cn(POPUP, className)} {...props} />
      </ContextPrimitive.Positioner>
    </ContextPrimitive.Portal>
  )
}

export {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuCheckItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuTrigger,
}
