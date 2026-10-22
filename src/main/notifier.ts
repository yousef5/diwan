import { Notification, nativeImage } from 'electron'
import type { GuestPayload } from '../shared/ipc'
import type { Logger } from './log'
import { formatNotification, shouldNotify } from './notify-rules'
import { escapeNotifyText } from './notify-text'
import { createRateLimiter } from './rate-limit'
import type { Registry } from './registry'
import type { StateHub } from './state'

// A compromised page must not be able to flood the desktop: at most 10 per 10 s per account,
// and a new notification with the same WhatsApp tag replaces the previous one.
const allowNotification = createRateLimiter(10, 10_000)

export interface NotifierDeps {
  hub: StateHub
  registry: Registry
  log: Logger
  isWindowFocused(): boolean
  reveal(accountId: string): void
  flash(): void
}

// Native notifications for WhatsApp's own (intercepted by the guest shim). Clicking one opens
// the account, then replays WhatsApp's onclick in that guest, which opens the right chat.
export class Notifier {
  private live = new Map<string, Notification>()
  private byTag = new Map<string, string>() // `${accountId}:${tag}` → live key

  constructor(private readonly d: NotifierDeps) {}

  show(accountId: string, p: GuestPayload<'guest:notify'>): void {
    const account = this.d.hub.account(accountId)
    if (!account || !Notification.isSupported()) return
    const s = this.d.hub.settings().notifications
    const focused = this.d.isWindowFocused()
    if (
      !shouldNotify({
        enabled: s.enabled,
        muted: account.muted,
        windowFocused: focused,
        activeId: this.d.hub.active(),
        accountId,
      })
    )
      return

    if (!allowNotification(accountId)) {
      this.d.log.warn('notifications rate-limited', { accountId })
      return
    }

    const text = formatNotification({
      accountName: account.name,
      title: p.title,
      body: p.body,
      showPreview: s.showPreview,
    })
    const decoded = s.showPreview && p.icon ? nativeImage.createFromDataURL(p.icon) : undefined
    const icon = decoded && !decoded.isEmpty() ? decoded : undefined
    const n = new Notification({
      title: text.title, // the summary is plain text on freedesktop servers; only the body takes markup
      body: escapeNotifyText(text.body),
      silent: !s.sound || p.silent,
      icon,
    })
    const key = `${accountId}:${p.nid}`
    if (p.tag) {
      const tagKey = `${accountId}:${p.tag}`
      const previous = this.byTag.get(tagKey)
      if (previous) {
        this.live.get(previous)?.close()
        this.live.delete(previous)
      }
      this.byTag.set(tagKey, key)
    }
    n.on('click', () => {
      this.live.delete(key)
      this.d.reveal(accountId)
      this.d.registry.guestOf(accountId)?.send('guest:notify-click', { nid: p.nid })
    })
    n.on('close', () => this.live.delete(key))
    this.live.get(key)?.close()
    this.live.set(key, n)
    n.show()
    if (s.markUrgent && !focused) this.d.flash()
  }

  close(accountId: string, nid: string): void {
    const key = `${accountId}:${nid}`
    this.live.get(key)?.close()
    this.live.delete(key)
  }
}
