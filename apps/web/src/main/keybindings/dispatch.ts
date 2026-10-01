import { useEffect, useRef } from 'react'
import { KEYBINDINGS, isMac, type KeybindingCommand } from './commands'

/**
 * One window-level dispatcher resolves every keydown against the bindings,
 * and components register what each command does (Otter Mail's dispatch.ts,
 * slimmed down). The most recently mounted owner of a command handles it; a
 * handler that returns `false` passes, leaving the key to the page.
 */

export type CommandHandler = (event: KeyboardEvent) => boolean | void

const handlers = new Map<KeybindingCommand, Array<{ run: CommandHandler }>>()

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target.closest(
      'input, textarea, select, [contenteditable=""], [contenteditable="true"], [data-univer-host]',
    ) !== null
  )
}

/** A dialog, menu or select is open: plain keys belong to it. (Toasts are
 *  dialogs too, to assistive tech, but they don't take the keyboard.) */
export function isOverlayOpen(): boolean {
  return (
    document.querySelector(
      '[data-slot="dialog-content"], [aria-modal="true"], [role="alertdialog"], [role="menu"], [role="listbox"]:not([aria-label="Results"])',
    ) !== null
  )
}

function matches(key: string, event: KeyboardEvent): boolean {
  const parts = key.split('+')
  const main = parts.pop()!
  const mod = parts.includes('mod')
  const shift = parts.includes('shift')
  const alt = parts.includes('alt')
  const modPressed = isMac ? event.metaKey : event.ctrlKey
  const otherMod = isMac ? event.ctrlKey : event.metaKey
  if (mod !== modPressed || otherMod) return false
  if (alt !== event.altKey) return false
  // Symbols like "/" come with Shift on some layouts; only letters and named
  // keys check it.
  if (main.length > 1 || /[a-z]/i.test(main)) {
    if (shift !== event.shiftKey) return false
  }
  // Digits by their key's position: ⌥1 types "¡" on a Mac.
  if (/^[0-9]$/.test(main)) return event.code === `Digit${main}`
  return event.key.toLowerCase() === main.toLowerCase()
}

function dispatch(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing) return
  const editable = isEditable(event.target)
  const overlay = isOverlayOpen()
  for (const binding of KEYBINDINGS) {
    if (!matches(binding.key, event)) continue
    if (!binding.global && (editable || overlay)) continue
    const list = handlers.get(binding.command)
    const owner = list?.[list.length - 1]
    if (!owner) continue
    if (owner.run(event) === false) continue
    event.preventDefault()
    return
  }
}

let installed = false

/** Registers handlers for commands while the component is mounted. */
export function useCommandHandlers(
  map: Partial<Record<KeybindingCommand, CommandHandler>>,
) {
  const latest = useRef(map)
  latest.current = map
  const commands = Object.keys(map).sort().join(' ')

  useEffect(() => {
    if (!installed) {
      window.addEventListener('keydown', dispatch)
      installed = true
    }
    const entries = (commands ? commands.split(' ') : []).map((command) => {
      const entry = {
        run: (event: KeyboardEvent) =>
          latest.current[command as KeybindingCommand]?.(event),
      }
      const list = handlers.get(command as KeybindingCommand) ?? []
      list.push(entry)
      handlers.set(command as KeybindingCommand, list)
      return [command as KeybindingCommand, entry] as const
    })
    return () => {
      for (const [command, entry] of entries) {
        const list = handlers.get(command)
        if (list)
          handlers.set(
            command,
            list.filter((item) => item !== entry),
          )
      }
    }
  }, [commands])
}
