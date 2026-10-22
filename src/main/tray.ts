import { Menu, type MenuItemConstructorOptions, type NativeImage, nativeImage, Tray } from 'electron'
import type { Snapshot } from '../shared/types'
import { badgeKey, unreadTotal } from '../shared/unread'
import type { Logger } from './log'
import type { StateHub } from './state'

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

  constructor(private readonly d: TrayDeps) {}

  start(): boolean {
    try {
      this.tray = new Tray(nativeImage.createFromPath(this.d.icon))
      this.tray.setToolTip('Diwan')
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
    this.tray.setToolTip(total > 0 ? `Diwan · ${total} unread` : 'Diwan')

    const signature = JSON.stringify([
      s.accounts.map((a) => [a.id, a.name, a.muted, s.runtime[a.id]?.unread ?? 0]),
      s.settings.notifications.enabled,
    ])
    if (signature === this.menuSignature) return
    this.menuSignature = signature

    const accountItems: MenuItemConstructorOptions[] = s.accounts.map((a) => {
      const n = s.runtime[a.id]?.unread ?? 0
      return {
        label: `${a.name}${n > 0 ? `  (${n})` : ''}${a.muted ? '  · muted' : ''}`,
        click: () => this.d.reveal(a.id),
      }
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
          click: (item) => this.d.hub.updateSettings({ notifications: { enabled: !item.checked } }),
        },
        { type: 'separator' },
        { label: 'Quit Diwan', click: () => this.d.quit() },
      ]),
    )
  }
}
