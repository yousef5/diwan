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
      'spell:0',
      'spell:1',
      'spell:2',
      'spell:3',
      'spell:4',
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

  test('suggestion ids are index-based, never the word', () => {
    const m = buildMenu(p({ misspelledWord: 'x', dictionarySuggestions: ['a:b'] }), { dev: false })
    expect(ids(m)[0]).toBe('spell:0')
  })

  test('empty suggestions are dropped but keep the original index', () => {
    const m = buildMenu(p({ misspelledWord: 'x', dictionarySuggestions: ['', 'x'] }), { dev: false })
    expect(ids(m)).toEqual(['spell:1', 'addWord'])
  })

  test('link and image: link group, separator, image group', () => {
    const m = buildMenu(p({ linkURL: 'https://x.com', mediaType: 'image', srcURL: 'https://x.com/a.png' }), {
      dev: false,
    })
    expect(ids(m)).toEqual(['openLink', 'copyLink', '—', 'copyImage', 'saveImage'])
  })

  test('link inside an editable field: link items then edit roles', () => {
    const m = buildMenu(p({ linkURL: 'https://x.com', isEditable: true }), { dev: false })
    expect(ids(m)).toEqual([
      'openLink',
      'copyLink',
      '—',
      'role:cut',
      'role:copy',
      'role:paste',
      'role:pasteAndMatchStyle',
      'role:selectAll',
    ])
  })

  test('whitespace-only selection → empty', () => {
    expect(buildMenu(p({ selectionText: ' \n\t ' }), { dev: false })).toEqual([])
  })

  test('truncation never splits a surrogate pair', () => {
    const m = buildMenu(p({ selectionText: `${'a'.repeat(23)}😀bbb` }), { dev: false })
    const search = m[1]
    const label = search.type === 'item' ? search.label : ''
    expect(label).toContain('😀…')
    expect(label).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/)
  })

  test('control and bidi-format characters are stripped from labels', () => {
    const m = buildMenu(p({ selectionText: 'a\nb\u202ec' }), { dev: false })
    const search = m[1]
    const label = search.type === 'item' ? search.label : ''
    expect(label).not.toContain('\n')
    expect(label).not.toContain('\u202e')
    expect(label).toBe('Search the web for “a b c”')
  })

  test('ampersands are escaped for Electron mnemonics', () => {
    const m = buildMenu(p({ selectionText: 'R&D' }), { dev: false })
    const search = m[1]
    expect(search.type === 'item' && search.label).toContain('R&&D')
  })

  test('dev with nothing else → empty', () => {
    expect(buildMenu(p(), { dev: true })).toEqual([])
  })

  test('saveImage only for http(s), data:image and blob sources', () => {
    for (const srcURL of ['file:///x.png', 'javascript:x']) {
      expect(ids(buildMenu(p({ mediaType: 'image', srcURL }), { dev: false }))).toEqual(['copyImage'])
    }
    for (const srcURL of ['http://a/b.png', 'https://a/b.png', 'data:image/png;base64,AA', 'blob:x']) {
      expect(ids(buildMenu(p({ mediaType: 'image', srcURL }), { dev: false }))).toEqual([
        'copyImage',
        'saveImage',
      ])
    }
  })
})
