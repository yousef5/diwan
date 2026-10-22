// Matches on `code` (physical key), not `key`, so shortcuts work with the Arabic layout active.
export interface KeyInput {
  type: string
  code: string
  key: string
  control: boolean
  meta: boolean
  shift: boolean
  alt: boolean
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

export function matchShortcut(i: KeyInput): ShortcutAction | null {
  if (i.type !== 'keyDown' || i.alt) return null
  if (i.code === 'F5' && !i.control && !i.meta) return { type: 'reload' }
  if (!i.control && !i.meta) return null

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
      return i.shift ? null : { type: 'zoom', delta: -1 }
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
