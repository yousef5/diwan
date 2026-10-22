// Matches on `code` (physical key), not `key`, so shortcuts work with the Arabic layout active.
export interface KeyInput {
  type: string
  code: string
  key: string
  control: boolean
  meta: boolean
  shift: boolean
  alt: boolean
  isAutoRepeat?: boolean
}

export type ShortcutAction =
  | { type: 'account'; index: number }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'reload' }
  | { type: 'remount' }
  | { type: 'zoom'; delta: 1 | -1 | 0 }
  | { type: 'settings' }
  | { type: 'hide' }
  | { type: 'quit' }
  // a held one-shot key: swallow it so WhatsApp doesn't see it, but do nothing
  | { type: 'ignore' }

const ONE_SHOT = new Set<ShortcutAction['type']>(['reload', 'remount', 'settings', 'hide', 'quit'])

export function matchShortcut(i: KeyInput): ShortcutAction | null {
  const action = match(i)
  if (action && i.isAutoRepeat && ONE_SHOT.has(action.type)) return { type: 'ignore' }
  return action
}

function match(i: KeyInput): ShortcutAction | null {
  if (i.type !== 'keyDown' || i.alt) return null
  if (i.code === 'F5') return i.shift ? { type: 'remount' } : { type: 'reload' }
  // Ctrl on Linux/Windows, Cmd only on macOS
  const mod = process.platform === 'darwin' ? i.meta : i.control
  if (!mod) return null

  // NumLock off turns Numpad4 into ArrowLeft etc: a numpad digit only counts if it types a digit
  if (/^Numpad[0-9]$/.test(i.code) && !/^[0-9]$/.test(i.key)) return null

  const digit = /^(?:Digit|Numpad)([1-9])$/.exec(i.code)
  if (digit) return i.shift ? null : { type: 'account', index: Number(digit[1]) - 1 }

  switch (i.code) {
    case 'Tab':
      return i.shift ? { type: 'prev' } : { type: 'next' }
    case 'PageDown':
      return i.shift ? null : { type: 'next' }
    case 'PageUp':
      return i.shift ? null : { type: 'prev' }
    case 'KeyR':
      return i.shift ? { type: 'remount' } : { type: 'reload' }
    case 'Equal':
    case 'NumpadAdd':
      return { type: 'zoom', delta: 1 }
    case 'Minus':
    case 'NumpadSubtract':
      return { type: 'zoom', delta: -1 }
    case 'Digit0':
    case 'Numpad0':
      return i.shift ? null : { type: 'zoom', delta: 0 }
    case 'Comma':
      return i.shift ? null : { type: 'settings' }
    case 'KeyW':
      return i.shift ? null : { type: 'hide' }
    case 'KeyQ':
      return i.shift ? null : { type: 'quit' }
    default:
      return null
  }
}
