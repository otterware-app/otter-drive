import * as React from 'react'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { XIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from './button'

/**
 * Modal dialog (Base UI underneath, Otter Mail's frosted glass popup). Two
 * ways to use it:
 *
 *  - Props mode: pass `title` (plus `onConfirm`, `confirmLabel`, …) and the
 *    body as children; the header and a Cancel / Confirm footer are built for
 *    you. A successful `onConfirm` closes the dialog; a Promise disables the
 *    buttons until it settles, and a rejection keeps the dialog open. Enter
 *    confirms (Cmd+Enter inside multi-line fields).
 *  - Composition: `<Dialog open onOpenChange>` + `<DialogContent>` with
 *    `DialogHeader` / `DialogTitle` / `DialogFooter` parts.
 */

type DialogSize = 'small' | 'medium' | 'large' | 'xl'

const SIZE_CLASS: Record<DialogSize, string> = {
  small: 'max-w-80',
  medium: 'max-w-100',
  large: 'max-w-125',
  xl: 'max-w-150',
}

type DialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: React.ReactNode
  description?: React.ReactNode
  onConfirm?: () => void | Promise<void>
  confirmLabel?: React.ReactNode
  confirmVariant?: 'accent' | 'destructive'
  confirmDisabled?: boolean
  /** While true, Cancel, Escape and outside clicks don't close it. */
  busy?: boolean
  size?: DialogSize
  children?: React.ReactNode
}

function Dialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  confirmLabel,
  confirmVariant = 'accent',
  confirmDisabled,
  busy = false,
  size = 'medium',
  children,
}: DialogProps) {
  const propsMode =
    title !== undefined || description !== undefined || onConfirm !== undefined
  const [pending, setPending] = React.useState(false)
  const popupRef = React.useRef<HTMLDivElement>(null)
  const locked = busy || pending

  if (!propsMode) {
    return (
      <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
        {children}
      </DialogPrimitive.Root>
    )
  }

  const hasBody =
    children !== undefined && children !== null && children !== false
  const canConfirm = onConfirm !== undefined && !confirmDisabled && !locked

  const confirm = async () => {
    if (!onConfirm || !canConfirm) return
    setPending(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } catch {
      // Stay open: the handler surfaces its own error.
    } finally {
      setPending(false)
    }
  }

  // Enter confirms, like the default button of a macOS sheet. Multi-line
  // fields keep Enter for newlines and confirm on Cmd/Ctrl+Enter instead;
  // other buttons keep Enter for themselves.
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' || event.defaultPrevented) return
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    const target = event.target as HTMLElement
    const multiline = target.closest('textarea, [contenteditable="true"]')
    const otherControl = target.closest(
      "button, a[href], [role='button'], [role='option']",
    )
    const modifier = event.metaKey || event.ctrlKey
    if ((multiline || otherControl) && !modifier) return
    event.preventDefault()
    void confirm()
  }

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && locked) return
        onOpenChange(next)
      }}
    >
      <DialogContent
        ref={popupRef}
        size={size}
        initialFocus={(): HTMLElement | boolean => {
          // A body with its own controls focuses the first one; a plain
          // confirmation focuses the default button, so Enter acts on it.
          const content = popupRef.current
          const bodyControl = content?.querySelector<HTMLElement>(
            "[data-dialog-body] :is(input:not([hidden]), textarea, select, button, [tabindex]:not([tabindex='-1'])):not(:disabled)",
          )
          if (bodyControl) return bodyControl
          return (
            content?.querySelector<HTMLElement>(
              '[data-dialog-confirm]:not(:disabled)',
            ) ?? true
          )
        }}
      >
        <div className="flex min-h-0 flex-col" onKeyDown={onKeyDown}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? (
              <DialogDescription>{description}</DialogDescription>
            ) : null}
          </DialogHeader>
          {hasBody ? (
            <div
              data-dialog-body=""
              className={cn(
                'flex max-h-[60vh] min-h-0 flex-col gap-3 overflow-y-auto px-6 text-sm leading-5 text-foreground',
                onConfirm ? 'pb-1' : 'pb-5',
              )}
            >
              {children}
            </div>
          ) : null}
          {onConfirm ? (
            <DialogFooter>
              <Button
                variant="outline"
                disabled={locked}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                data-dialog-confirm=""
                variant={confirmVariant}
                disabled={!canConfirm}
                onClick={() => void confirm()}
              >
                {confirmLabel ?? 'Done'}
              </Button>
            </DialogFooter>
          ) : null}
        </div>
      </DialogContent>
    </DialogPrimitive.Root>
  )
}

function DialogContent({
  className,
  children,
  size = 'medium',
  showCloseButton = false,
  backdropClassName,
  ...props
}: DialogPrimitive.Popup.Props & {
  size?: DialogSize
  showCloseButton?: boolean
  backdropClassName?: string
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        data-slot="dialog-backdrop"
        className={cn(
          'dialog-backdrop fixed inset-0 z-[100] data-starting-style:animate-[dialog-fade-in_160ms_ease-out] data-ending-style:animate-[dialog-fade-out_120ms_ease-in]',
          backdropClassName,
        )}
      />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          'dialog-glass fixed top-1/2 left-1/2 z-[100] flex max-h-[85vh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border text-popover-foreground outline-none data-starting-style:animate-[dialog-pop-in_180ms_cubic-bezier(0.32,0.72,0,1)] data-ending-style:animate-[dialog-pop-out_120ms_ease-in]',
          SIZE_CLASS[size],
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton ? (
          <DialogPrimitive.Close
            aria-label="Close"
            className="absolute end-3 top-3 inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-accent-surface hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <XIcon className="size-4" />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn('flex flex-col gap-1.5 px-6 pt-6 pb-4', className)}
      {...props}
    />
  )
}

function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        'flex flex-col-reverse gap-2 px-6 pt-5 pb-6 sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    />
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        'text-base leading-[22px] font-medium text-foreground',
        className,
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-sm leading-5 text-muted-foreground', className)}
      {...props}
    />
  )
}

const DialogClose = DialogPrimitive.Close

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  type DialogProps,
}
