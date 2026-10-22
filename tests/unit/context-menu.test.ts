import { describe, expect, test } from 'vitest'
import { buildMenu, type MenuParams } from '../../src/main/context-menu'

const p = (over: Partial<MenuParams> = {}): MenuParams => ({
  x: 1,
  y: 2,
  isEditable: false,
  selectionText: '',
  misspelledWord: '',
  dictionarySuggestions: [],
  linkURL: '',
  mediaType: 'none',
  srcURL: '',
  editFlags: { canCut: false, canCopy: false, canPaste: false, canSelectAll: false },
  ...over,
})
const ids = (entries: ReturnType<typeof buildMenu>) =>
  entries.map((e) => (e.type === 'separator' ? '—' : e.type === 'role' ? `role:${e.role}` : e.id))

describe('buildMenu', () => {
  test('nothing to offer → empty', () => {
    expect(buildMenu(p(), { dev: false })).toEqual([])
  })

  test('misspelling in a text box: suggestions, add word, then editing roles', () => {
    const m = buildMenu(
      p({
        isEditable: true,
        misspelledWord: 'helo',
        dictionarySuggestions: ['hello', 'help', 'hero', 'halo', 'helot', 'hell'],
        editFlags: { canCut: true, canCopy: true, canPaste: true, canSelectAll: true },
      }),
      { dev: false },
    )
    expect(ids(m)).toEqual([
      'spell:hello',
      'spell:help',
      'spell:hero',
      'spell:halo',
      'spell:helot',
      'addWord',
      '—',
      'role:cut',
      'role:copy',
      'role:paste',
      'role:pasteAndMatchStyle',
      'role:selectAll',
    ])
  })

  test('misspelling with no suggestions shows a disabled hint', () => {
    const m = buildMenu(p({ isEditable: true, misspelledWord: 'qqq' }), { dev: false })
    expect(m[0]).toEqual({ type: 'item', id: 'noop', label: 'No suggestions', enabled: false })
  })

  test('link', () => {
    expect(ids(buildMenu(p({ linkURL: 'https://x.com' }), { dev: false }))).toEqual(['openLink', 'copyLink'])
  })

  test('blob link is not offered as a link', () => {
    expect(buildMenu(p({ linkURL: 'blob:https://web.whatsapp.com/1' }), { dev: false })).toEqual([])
  })

  test('image', () => {
    expect(ids(buildMenu(p({ mediaType: 'image', srcURL: 'blob:x' }), { dev: false }))).toEqual([
      'copyImage',
      'saveImage',
    ])
  })

  test('selected text outside a text box: copy and search', () => {
    const m = buildMenu(p({ selectionText: 'a very long selection that goes on and on' }), { dev: false })
    expect(ids(m)).toEqual(['role:copy', 'search'])
    const search = m[1]
    expect(search.type === 'item' && search.label).toBe('Search the web for “a very long selection th…”')
  })

  test('dev adds Inspect', () => {
    expect(ids(buildMenu(p({ linkURL: 'https://x.com' }), { dev: true }))).toEqual([
      'openLink',
      'copyLink',
      '—',
      'inspect',
    ])
  })
})
