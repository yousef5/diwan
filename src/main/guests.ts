import type { WebContents } from 'electron'
import type { AccountRuntime, ShellCommand, ViewState } from '../shared/types'
import { parseUnread } from '../shared/unread'
import { popupContextMenu } from './context-menu-popup'
import { loadStateForError } from './guest-config'
import { performLink } from './link-actions'
import { classifyLink, WA_ORIGIN } from './link-policy'
import type { Logger } from './log'
import type { Registry } from './registry'
import { matchShortcut, type ShortcutAction } from './shortcuts'
import type { StateHub } from './state'
import { watchHang } from './watchdog'

// Crash times per account. Module-level on purpose: every remount is a NEW webContents, so a
// counter inside wireGuest would restart at zero each time.
const crashLog = new Map<string, number[]>()
let clock: () => number = Date.now

export function resetCrashes(accountId: string): void {
  crashLog.delete(accountId)
}

// test-only
export function setClock(fn: () => number): void {
  clock = fn
}

export interface GuestDeps {
  hub: StateHub
  registry: Registry
  log: Logger
  dev: boolean
  sendShell(cmd: ShellCommand): void
  onShortcut(action: ShortcutAction): void
  onDestroyed?(accountId: string): void
}

// Everything a WhatsApp guest does goes through here: links, menus, keys, unread, load state.
export function wireGuest(wc: WebContents, accountId: string, d: GuestDeps): void {
  d.registry.attach(wc, accountId)
  // A logging-out account is being torn down: its old guest's events must not touch the state
  // (the logout handler sets 'loading' itself once the guest is detached).
  const loggingOut = () => d.hub.runtimeOf(accountId).state === 'loggingOut'
  const setState = (state: ViewState, extra: Partial<AccountRuntime> = {}) => {
    if (loggingOut()) return
    d.hub.setRuntime(accountId, { ...extra, state })
  }
  setState('loading') // a fresh (or remounted) guest starts clean
  // the user agent is set once on the session (sessions.ts), not per guest

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
  let blockedUrl: string | null = null
  wc.on('did-start-navigation', (details) => {
    if (!details.isMainFrame || details.isSameDocument) return
    if (isWhatsAppOrigin(details.url)) {
      blockedUrl = null
      return
    }
    // wc.stop() inside this event is a CHECK failure in Electron 44 (kills main): defer it
    blockedUrl = details.url
    setImmediate(() => {
      if (wc.isDestroyed() || blockedUrl !== details.url) return // will-navigate handled it, or a newer nav replaced it
      blockedUrl = null
      wc.stop()
      d.log.warn('stopped a navigation away from WhatsApp', { accountId })
      performLink(classifyLink(details.url), wc, d.log)
    })
  })
  wc.on('did-navigate', (_e, url) => {
    if (!isWhatsAppOrigin(url)) {
      // backstop for anything the guards missed (about:blank...)
      d.log.warn('guest left WhatsApp, reloading it', { accountId })
      void wc.loadURL(`${WA_ORIGIN}/`)
      return
    }
    // a committed WhatsApp page clears a stale failure; did-stop-loading then marks it ready
    const s = d.hub.runtimeOf(accountId).state
    if (s === 'offline' || s === 'failed') setState('loading')
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
    if (url === blockedUrl) blockedUrl = null
    performLink(action, wc, d.log)
  })

  wc.on('context-menu', (_e, params) => popupContextMenu(wc, params, { dev: d.dev, log: d.log }))

  wc.on('before-input-event', (event, input) => {
    const action = matchShortcut(input)
    if (!action) return
    event.preventDefault()
    d.onShortcut(action)
  })

  wc.on('page-title-updated', (_e, title) => {
    // while loading, a title without a "(N)" prefix is the bare page title: keep the old badge
    if (loggingOut()) return
    const rt = d.hub.runtimeOf(accountId)
    if (rt.state === 'loading' && !/^\s*\(/.test(title)) return
    // a page can rewrite its title in a tight loop: only a changed count is worth any work
    const unread = parseUnread(title)
    if (unread !== rt.unread) d.hub.setRuntime(accountId, { unread })
  })

  wc.on('did-start-loading', () => {
    const state = d.hub.runtimeOf(accountId).state
    if (state !== 'offline' && state !== 'failed') setState('loading')
  })
  wc.on('did-stop-loading', () => {
    if (d.hub.runtimeOf(accountId).state !== 'loading') return
    // a page that is not WhatsApp (blank, error page) must show Retry, not an empty "ready"
    if (!isWhatsAppOrigin(wc.getURL())) {
      setState('failed')
      return
    }
    // the title guard ignores bare titles while loading and Chromium won't re-fire the event: re-read it
    setState('ready', { unread: parseUnread(wc.getTitle()) })
  })
  wc.on('did-fail-load', (_e, code, description, _url, isMainFrame) => {
    if (!isMainFrame) return
    const state = loadStateForError(code)
    if (!state) return
    setState(state)
    d.log.warn('guest load failed', { accountId, code, description })
  })
  wc.on('did-finish-load', () => wc.setZoomLevel(d.hub.account(accountId)?.zoom ?? 0))

  wc.on('render-process-gone', (_e, details) => {
    if (loggingOut()) return
    if (details.reason === 'clean-exit') {
      // a clean exit while still mounted means the page died on its own
      if (!wc.isDestroyed()) setState('failed')
      return
    }
    d.log.error('guest renderer gone', { accountId, reason: details.reason })
    const now = clock()
    const crashes = (crashLog.get(accountId) ?? []).filter((t) => now - t <= 60_000)
    crashes.push(now)
    crashLog.set(accountId, crashes)
    if (crashes.length >= 3) {
      d.log.error('guest crashed 3 times in 60 s, giving up', { accountId })
      setState('failed')
      return
    }
    d.sendShell({ type: 'remount', id: accountId })
  })
  watchHang(wc, () => {
    if (loggingOut()) return
    d.log.warn('guest hung, remounting', { accountId })
    setState('hung')
    d.sendShell({ type: 'remount', id: accountId })
  })

  wc.once('destroyed', () => {
    d.registry.detach(wc.id)
    d.onDestroyed?.(accountId)
  })
}
