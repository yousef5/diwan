export interface MenuParams {
  x: number
  y: number
  isEditable: boolean
  selectionText: string
  misspelledWord: string
  dictionarySuggestions: string[]
  linkURL: string
  mediaType: string
  srcURL: string
  editFlags: { canCut: boolean; canCopy: boolean; canPaste: boolean; canSelectAll: boolean }
}

export type EditRole = 'cut' | 'copy' | 'paste' | 'pasteAndMatchStyle' | 'selectAll'

export type MenuEntry =
  | { type: 'separator' }
  | { type: 'item'; id: string; label: string; enabled?: boolean }
  | { type: 'role'; role: EditRole; label?: string; enabled?: boolean }

const SEARCH_LABEL_MAX = 24
const SAVEABLE_SRC = ['http:', 'https:', 'data:image/', 'blob:']

// Page-controlled text becomes a menu label: strip control/format chars, collapse
// whitespace, cut by code point, and escape '&' (Electron's mnemonic marker).
function labelText(s: string, max: number): string {
  const clean = s
    .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const cps = Array.from(clean)
  const cut = cps.length > max ? `${cps.slice(0, max).join('')}…` : clean
  return cut.replace(/&/g, '&&')
}

export function buildMenu(p: MenuParams, o: { dev: boolean }): MenuEntry[] {
  const groups: MenuEntry[][] = []

  if (p.misspelledWord) {
    const g: MenuEntry[] = []
    p.dictionarySuggestions.slice(0, 5).forEach((s, i) => {
      if (s.trim()) g.push({ type: 'item', id: `spell:${i}`, label: labelText(s, 40) })
    })
    if (g.length === 0) g.push({ type: 'item', id: 'noop', label: 'No suggestions', enabled: false })
    g.push({ type: 'item', id: 'addWord', label: `Add “${labelText(p.misspelledWord, 40)}” to dictionary` })
    groups.push(g)
  }

  if (p.linkURL && !p.linkURL.startsWith('blob:')) {
    groups.push([
      { type: 'item', id: 'openLink', label: 'Open link in browser' },
      { type: 'item', id: 'copyLink', label: 'Copy link' },
    ])
  }

  if (p.mediaType === 'image' && p.srcURL) {
    const g: MenuEntry[] = [{ type: 'item', id: 'copyImage', label: 'Copy image' }]
    if (SAVEABLE_SRC.some((prefix) => p.srcURL.startsWith(prefix))) {
      g.push({ type: 'item', id: 'saveImage', label: 'Save image to Downloads' })
    }
    groups.push(g)
  }

  if (p.isEditable) {
    groups.push([
      { type: 'role', role: 'cut', enabled: p.editFlags.canCut },
      { type: 'role', role: 'copy', enabled: p.editFlags.canCopy },
      { type: 'role', role: 'paste', enabled: p.editFlags.canPaste },
      {
        type: 'role',
        role: 'pasteAndMatchStyle',
        label: 'Paste as plain text',
        enabled: p.editFlags.canPaste,
      },
      { type: 'role', role: 'selectAll', enabled: p.editFlags.canSelectAll },
    ])
  } else if (p.selectionText.trim()) {
    groups.push([
      { type: 'role', role: 'copy' },
      {
        type: 'item',
        id: 'search',
        label: `Search the web for “${labelText(p.selectionText, SEARCH_LABEL_MAX)}”`,
      },
    ])
  }

  if (o.dev && groups.length) groups.push([{ type: 'item', id: 'inspect', label: 'Inspect element' }])

  return groups.flatMap((g, i) => (i === 0 ? g : [{ type: 'separator' } as MenuEntry, ...g]))
}
