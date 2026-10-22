import type { WebContents } from 'electron'
import type { ShellCommand } from '../shared/types'
import { parseUnread } from '../shared/unread'
import { popupContextMenu } from './context-menu-popup'
import { chromeUserAgent, loadStateForError } from './guest-config'
import { performLink } from './link-actions'
import { classifyLink, WA_ORIGIN } from './link-policy'
import type { Logger } from './log'
import type { Registry } from './registry'
import { matchShortcut, type ShortcutAction } from './shortcuts'
import type { StateHub } from './state'
import { watchHang } from './watchdog'

export interface GuestDeps {
  hub: StateHub
  registry: Registry
  log: Logger
  dev: boolean
  sendShell(cmd: ShellCommand): void
  onShortcut(action: ShortcutAction): void
}

// Everything a WhatsApp guest does goes through here: links, menus, keys, unread, load state.
export function wireGuest(wc: WebContents, accountId: string, d: GuestDeps): void {
  d.registry.attach(wc, accountId)
  d.hub.setRuntime(accountId, { state: 'loading' }) // a fresh (or remounted) guest starts clean
  wc.setUserAgent(chromeUserAgent())

  wc.setWindowOpenHandler(({ url }) => {
    performLink(classifyLink(url), wc, d.log)
    return { action: 'deny' }
  })
  // will-attach-webview only checks the first URL. Programmatic loads and server redirects skip
  // will-navigate, so every main-frame navigation start and redirect is checked too: only
  // web.whatsapp.com itself may be the main frame (the preload runs there).
  const isWhatsAppOrigin = (url: string) => {
    try {
      return new URL(url).origin === WA_ORIGIN
    } catch {
      return false
    }
  }
  wc.on('did-start-navigation', (details) => {
    if (!details.isMainFrame || details.isSameDocument || isWhatsAppOrigin(details.url)) return
    wc.stop()
    d.log.warn('stopped a navigation away from WhatsApp', { accountId })
    performLink(classifyLink(details.url), wc, d.log)
  })
  wc.on('will-redirect', (details) => {
    if (!details.isMainFrame || isWhatsAppOrigin(details.url)) return
    details.preventDefault()
    d.log.warn('blocked a redirect away from WhatsApp', { accountId })
  })
  wc.on('will-navigate', (event, url) => {
    const action = classifyLink(url)
    if (action.kind === 'internal') return
    event.preventDefault()
    performLink(action, wc, d.log)
  })

  wc.on('context-menu', (_e, params) => popupContextMenu(wc, params, { dev: d.dev, log: d.log }))

  wc.on('before-input-event', (event, input) => {
    const action = matchShortcut(input)
    if (!action) return
    event.preventDefault()
    d.onShortcut(action)
  })

  wc.on('page-title-updated', (_e, title) => d.hub.setRuntime(accountId, { unread: parseUnread(title) }))

  wc.on('did-start-loading', () => {
    const state = d.hub.runtimeOf(accountId).state
    if (state !== 'offline' && state !== 'failed') d.hub.setRuntime(accountId, { state: 'loading' })
  })
  wc.on('did-stop-loading', () => {
    if (d.hub.runtimeOf(accountId).state === 'loading') d.hub.setRuntime(accountId, { state: 'ready' })
  })
  wc.on('did-fail-load', (_e, code, description, _url, isMainFrame) => {
    if (!isMainFrame) return
    const state = loadStateForError(code)
    if (!state) return
    d.hub.setRuntime(accountId, { state })
    d.log.warn('guest load failed', { accountId, code, description })
  })
  wc.on('did-finish-load', () => wc.setZoomLevel(d.hub.account(accountId)?.zoom ?? 0))

  wc.on('render-process-gone', (_e, details) => {
    if (details.reason === 'clean-exit') return
    d.log.error('guest renderer gone', { accountId, reason: details.reason })
    d.sendShell({ type: 'remount', id: accountId })
  })
  watchHang(wc, () => {
    d.log.warn('guest hung, remounting', { accountId })
    d.hub.setRuntime(accountId, { state: 'hung' })
    d.sendShell({ type: 'remount', id: accountId })
  })

  wc.once('destroyed', () => d.registry.detach(wc.id))
}
