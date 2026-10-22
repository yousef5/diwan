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

const shorten = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s)

export function buildMenu(p: MenuParams, o: { dev: boolean }): MenuEntry[] {
  const groups: MenuEntry[][] = []

  if (p.misspelledWord) {
    const g: MenuEntry[] = p.dictionarySuggestions
      .slice(0, 5)
      .map((s): MenuEntry => ({ type: 'item', id: `spell:${s}`, label: s }))
    if (g.length === 0) g.push({ type: 'item', id: 'noop', label: 'No suggestions', enabled: false })
    g.push({ type: 'item', id: 'addWord', label: `Add “${p.misspelledWord}” to dictionary` })
    groups.push(g)
  }

  if (p.linkURL && !p.linkURL.startsWith('blob:')) {
    groups.push([
      { type: 'item', id: 'openLink', label: 'Open link in browser' },
      { type: 'item', id: 'copyLink', label: 'Copy link' },
    ])
  }

  if (p.mediaType === 'image' && p.srcURL) {
    groups.push([
      { type: 'item', id: 'copyImage', label: 'Copy image' },
      { type: 'item', id: 'saveImage', label: 'Save image to Downloads' },
    ])
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
      { type: 'item', id: 'search', label: `Search the web for “${shorten(p.selectionText.trim(), 24)}”` },
    ])
  }

  if (o.dev && groups.length) groups.push([{ type: 'item', id: 'inspect', label: 'Inspect element' }])

  return groups.flatMap((g, i) => (i === 0 ? g : [{ type: 'separator' } as MenuEntry, ...g]))
}
