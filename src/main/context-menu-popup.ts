import {
  BrowserWindow,
  type ContextMenuParams,
  clipboard,
  Menu,
  type MenuItemConstructorOptions,
  shell,
  type WebContents,
} from 'electron'
import { buildMenu, type MenuEntry } from './context-menu'
import { performLink } from './link-actions'
import { classifyLink } from './link-policy'
import type { Logger } from './log'

export function popupContextMenu(
  wc: WebContents,
  params: ContextMenuParams,
  o: { dev: boolean; log: Logger },
): void {
  const entries = buildMenu(
    {
      x: params.x,
      y: params.y,
      isEditable: params.isEditable,
      selectionText: params.selectionText,
      misspelledWord: params.misspelledWord,
      dictionarySuggestions: params.dictionarySuggestions,
      linkURL: params.linkURL,
      mediaType: params.mediaType,
      srcURL: params.srcURL,
      editFlags: params.editFlags,
    },
    { dev: o.dev },
  )
  if (entries.length === 0) return

  const run = (id: string) => {
    if (id.startsWith('spell:')) {
      const word = params.dictionarySuggestions[Number(id.slice('spell:'.length))]
      if (word) wc.replaceMisspelling(word)
      return
    }
    switch (id) {
      case 'addWord':
        wc.session.addWordToSpellCheckerDictionary(params.misspelledWord)
        return
      case 'openLink': {
        const action = classifyLink(params.linkURL)
        performLink(
          action.kind === 'internal' ? { kind: 'external', url: params.linkURL } : action,
          wc,
          o.log,
        )
        return
      }
      case 'copyLink':
        clipboard.writeText(params.linkURL).catch((e) => o.log.warn('copy link failed', e))
        return
      case 'copyImage':
        wc.copyImageAt(params.x, params.y)
        return
      case 'saveImage':
        wc.downloadURL(params.srcURL)
        return
      case 'search':
        shell
          .openExternal(
            `https://www.google.com/search?q=${encodeURIComponent(Array.from(params.selectionText.trim()).slice(0, 500).join(''))}`,
          )
          .catch((e) => o.log.warn('search open failed', e))
        return
      case 'inspect':
        wc.inspectElement(params.x, params.y)
        return
    }
  }

  const template: MenuItemConstructorOptions[] = entries.map((e: MenuEntry): MenuItemConstructorOptions => {
    if (e.type === 'separator') return { type: 'separator' }
    if (e.type === 'role') return { role: e.role, label: e.label, enabled: e.enabled ?? true }
    return { label: e.label, enabled: e.enabled ?? true, click: () => run(e.id) }
  })
  const host = wc.hostWebContents ?? wc
  Menu.buildFromTemplate(template).popup({ window: BrowserWindow.fromWebContents(host) ?? undefined })
}
