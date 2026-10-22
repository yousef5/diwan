import { Menu, type MenuItemConstructorOptions, type NativeImage, nativeImage, Tray } from 'electron'
import type { Snapshot } from '../shared/types'
import { badgeKey, unreadTotal } from '../shared/unread'
import type { Logger } from './log'
import type { StateHub } from './state'
import { trayAccountLabel, trayMenuSignature } from './tray-text'

export interface TrayDeps {
  hub: StateHub
  icon: string
  log: Logger
  show(): void
  reveal(accountId: string): void
  quit(): void
}

// Badge images (none, 1–9, 9+) are drawn by the shell once and handed over (tray:setBadges).
export class TrayController {
  private tray: Tray | null = null
  private images = new Map<string, NativeImage>()
  private shownKey = ''
  private menuSignature = ''
  private tooltip = ''

  constructor(private readonly d: TrayDeps) {}

  start(): boolean {
    try {
      const base = nativeImage.createFromPath(this.d.icon)
      if (base.isEmpty()) {
        this.d.log.warn('tray icon missing or unreadable', this.d.icon)
        return false
      }
      this.tray = new Tray(base)
      this.tooltip = 'Diwan'
      this.tray.setToolTip(this.tooltip)
      this.tray.on('click', () => this.d.show())
      this.update(this.d.hub.snapshot())
      return true
    } catch (e) {
      this.d.log.warn('tray unavailable', e)
      return false
    }
  }

  setBadges(images: Record<string, string>): void {
    for (const [key, url] of Object.entries(images)) this.images.set(key, nativeImage.createFromDataURL(url))
    this.shownKey = ''
    this.update(this.d.hub.snapshot())
  }

  update(s: Snapshot): void {
    if (!this.tray) return
    const total = unreadTotal(s.accounts, s.runtime)
    const key = badgeKey(total)
    const image = this.images.get(key)
    if (image && key !== this.shownKey) {
      this.tray.setImage(image)
      this.shownKey = key
    }
    const tip = total > 0 ? `Diwan · ${total} unread` : 'Diwan'
    if (tip !== this.tooltip) {
      this.tooltip = tip
      this.tray.setToolTip(tip)
    }

    const signature = trayMenuSignature(s)
    if (signature === this.menuSignature) return
    this.menuSignature = signature

    const accountItems: MenuItemConstructorOptions[] = s.accounts.map((a) => {
      const n = s.runtime[a.id]?.unread ?? 0
      return { label: trayAccountLabel(a.name, n, a.muted), click: () => this.d.reveal(a.id) }
    })
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Show Diwan', click: () => this.d.show() },
        { type: 'separator' },
        ...accountItems,
        ...(accountItems.length ? [{ type: 'separator' as const }] : []),
        {
          label: 'Pause notifications',
          type: 'checkbox',
          checked: !s.settings.notifications.enabled,
          click: (item) => {
            this.d.hub.updateSettings({ notifications: { enabled: !item.checked } })
            this.menuSignature = ''
            this.update(this.d.hub.snapshot())
          },
        },
        { type: 'separator' },
        { label: 'Quit Diwan', click: () => this.d.quit() },
      ]),
    )
  }
}
