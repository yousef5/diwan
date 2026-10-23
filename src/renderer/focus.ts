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
