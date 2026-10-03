/**
 * Every command a key can trigger, and its keys (Otter Mail's model, without
 * the editor: a closed set of command ids with fixed bindings). `mod` is ⌘
 * on a Mac and Ctrl elsewhere.
 *
 * `when` keys (see dispatch.ts):
 * - editableFocus: typing in an input, textarea or the document editor
 * - dialogOpen:    a dialog, popover or menu is open
 */

export type KeybindingCommand =
  | 'commandPalette.toggle'
  | 'sidebar.toggle'
  | 'search.focus'
  | 'document.upload'
  | 'list.next'
  | 'list.previous'
  | 'document.close'
  | `folder.jump.${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`

export interface Keybinding {
  command: KeybindingCommand
  key: string
  /** Also runs while typing or with a dialog open. */
  global?: boolean
}

export const KEYBINDINGS: readonly Keybinding[] = [
  { command: 'commandPalette.toggle', key: 'mod+k', global: true },
  { command: 'sidebar.toggle', key: 'mod+b', global: true },
  { command: 'search.focus', key: '/' },
  { command: 'document.upload', key: 'u' },
  { command: 'list.next', key: 'j' },
  { command: 'list.next', key: 'ArrowDown' },
  { command: 'list.previous', key: 'k' },
  { command: 'list.previous', key: 'ArrowUp' },
  { command: 'document.close', key: 'Escape' },
  // ⌥1…⌥9 pick a folder in the rail (⌘1… belong to the browser's tabs). Not
  // while typing: ⌥digits type #, [, | and friends on many layouts.
  ...([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map((digit): Keybinding => ({
    command: `folder.jump.${digit}`,
    key: `alt+${digit}`,
  })),
]

export const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

const KEY_LABELS: Record<string, string> = {
  alt: isMac ? '⌥' : 'Alt+',
  shift: isMac ? '⇧' : 'Shift+',
  ArrowDown: '↓',
  ArrowUp: '↑',
  Escape: 'Esc',
}

/** The first key of a command, as a hint: "⌘K", "Ctrl+B", "J". */
export function shortcutLabel(command: KeybindingCommand): string | undefined {
  const binding = KEYBINDINGS.find((item) => item.command === command)
  if (!binding) return undefined
  return binding.key
    .split('+')
    .map((part) =>
      part === 'mod'
        ? isMac
          ? '⌘'
          : 'Ctrl+'
        : (KEY_LABELS[part] ?? part.toUpperCase()),
    )
    .join('')
}
