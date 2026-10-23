import type { Platform } from '../shared/types'
import { badgeKey, type OverlayKey } from '../shared/unread'

// The unread total on the taskbar or launcher icon, next to the window title and the tray image.
// - Windows: an overlay icon on the taskbar button. Main can't draw text, so the shell draws one
//   16 px badge per key (1–9, 9+) and hands it over (taskbar:setBadges); at 0 the overlay is cleared.
// - Linux: the launcher count (Unity, KDE, Dash-to-Dock), matched to the app by its desktop name.
//   Desktops without it just ignore it.
// Pure: Electron comes in through the deps, so this is testable without it.

export interface OverlayWindow<I> {
  setOverlayIcon(image: I | null, description: string): void
  isDestroyed(): boolean
}

export interface TaskbarBadgeDeps<I> {
  platform: Platform
  win(): OverlayWindow<I> | null
  decode(dataUrl: string): I
  setBadgeCount(count: number): unknown
  warn(message: string, e?: unknown): void
}

export class TaskbarBadge<I> {
  private images = new Map<OverlayKey, I>()
  private total = 0
  private shown: string | null = null // the overlay last set: '' cleared, else `${key} ${total}`
  private counted: number | null = null

  constructor(private readonly d: TaskbarBadgeDeps<I>) {}

  setImages(images: Partial<Record<OverlayKey, string>>): void {
    if (this.d.platform !== 'win32') return
    for (const [key, url] of Object.entries(images) as [OverlayKey, string | undefined][])
      if (url) this.images.set(key, this.d.decode(url))
    this.shown = null
    this.update(this.total)
  }

  update(total: number): void {
    this.total = total
    try {
      if (this.d.platform === 'win32') this.overlay(total)
      else if (this.d.platform === 'linux' && total !== this.counted) {
        this.counted = total
        this.d.setBadgeCount(total)
      }
    } catch (e) {
      this.d.warn('could not set the unread badge', e)
    }
  }

  private overlay(total: number): void {
    const w = this.d.win()
    if (!w || w.isDestroyed()) return
    const key = badgeKey(total)
    if (key === 'none') {
      if (this.shown === '') return
      w.setOverlayIcon(null, '')
      this.shown = ''
      return
    }
    // No image yet: the shell sends it right after this snapshot, and setImages shows it then.
    const image = this.images.get(key)
    const id = `${key} ${total}`
    if (!image || id === this.shown) return
    w.setOverlayIcon(image, `${total} unread`)
    this.shown = id
  }
}
