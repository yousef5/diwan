// Where keyboard focus goes when the thing that had it disappears (a menu item that opened a dialog,
// an account that was removed). Rail tiles carry data-account-tile="<id>", and the active one also
// carries data-active-tile.

export function accountTile(id: string | null | undefined): HTMLElement | null {
  if (!id) return null
  for (const el of document.querySelectorAll<HTMLElement>('[data-account-tile]')) {
    if (el.dataset.accountTile === id) return el
  }
  return null
}

export function activeTile(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-active-tile]')
}

// The main region (the WhatsApp stage). Made programmatically focusable if it isn't already.
export function mainRegion(): HTMLElement | null {
  const main = document.querySelector<HTMLElement>('main')
  if (main && !main.hasAttribute('tabindex')) main.tabIndex = -1
  return main
}

// Focuses the first candidate that is still in the document and actually takes focus (a disabled
// or hidden element doesn't). True when one did.
export function focusFirst(candidates: (() => Element | null | undefined)[]): boolean {
  for (const get of candidates) {
    const el = get()
    if (!(el instanceof HTMLElement) || !el.isConnected) continue
    el.focus()
    if (document.activeElement === el) return true
  }
  return false
}

// Whether the stage (a webview, or a status overlay's button) may take focus on its own: when an
// account is switched to, remounted or uncovered. Never away from Settings, a dialog or a menu, and
// never from a control the user reached by keyboard outside the stage (Enter on a rail tile keeps
// focus on the rail; a mouse click on it hands focus to WhatsApp, so typing can start at once).
export function stageMayTakeFocus(blocked: boolean): boolean {
  if (blocked) return false
  const el = document.activeElement
  if (!el || el === document.body) return true
  if (el.closest('main')) return true
  if (el.closest('[role="dialog"], [role="alertdialog"], [role="menu"]')) return false
  try {
    return !el.matches(':focus-visible')
  } catch {
    return true // jsdom (tests) doesn't know :focus-visible
  }
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// The controls inside `root` that Tab reaches, in document order. :disabled also catches controls
// inside a disabled <fieldset>; checkVisibility() catches display:none and content-visibility from
// CSS (jsdom lacks it, hence the optional call).
export function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) =>
      !el.matches(':disabled') &&
      !el.closest('[hidden], [inert], [aria-hidden="true"]') &&
      el.checkVisibility?.() !== false,
  )
}

// Keeps Tab and Shift+Tab inside a modal layer (`root`): the keydown handler of a dialog or of
// the settings page. With nothing focusable, focus stays where it is.
export function trapTab(
  e: { key: string; shiftKey: boolean; preventDefault(): void },
  root: HTMLElement,
): void {
  if (e.key !== 'Tab') return
  const items = focusables(root)
  if (items.length === 0) {
    e.preventDefault()
    return
  }
  const first = items[0]
  const last = items[items.length - 1]
  const active = document.activeElement
  if (e.shiftKey && (active === first || active === root)) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && active === last) {
    e.preventDefault()
    first.focus()
  }
}
