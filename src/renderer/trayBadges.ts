import { type BadgeKey, badgeKey, type OverlayKey } from '../shared/unread'
import { MARK_PATHS } from './icons'

// The tray icon with an unread badge. Main picks which image to show from its own snapshot
// (src/main/tray.ts: badgeKey of the unmuted total) but can't draw text, so the shell draws them:
// one 32 px PNG per badge key (none, 1–9, 9+), each drawn once, the first time the total needs it,
// and sent with tray:setBadges. A count that maps to an image already sent costs nothing.

export const BADGE_SIZE = 32

// What the badge says for an unread total: nothing at 0, the count up to 9, then "9+". A 32 px tray
// icon has room for two characters at a legible size, so the cap is 9+, not the rail's 99+.
export function badgeLabel(total: number): string | null {
  const key = badgeKey(total)
  return key === 'none' ? null : key
}

export interface TrayBadgeDeps<K extends BadgeKey = BadgeKey> {
  // Resolves once the badge font can be drawn.
  ready(): Promise<void>
  // A PNG data URL for the key, or null when it can't be drawn (no canvas).
  paint(key: K): string | null
  // Hands images to main; false when main refused them.
  send(images: Partial<Record<K, string>>): Promise<boolean>
  // Which keys have an image at all (the taskbar overlay has none for 'none'). Default: every key.
  drawn?(key: BadgeKey): key is K
}

// show(total) on every snapshot. Cheap when nothing changed: the same badge key as last time
// returns at once, and a key whose image main already has is never drawn or sent again. A failed
// send forgets the key, and if the total still maps to it, forgets that it was last too: the next
// snapshot tries once more (one try per snapshot, never a loop), so a badge that failed while the
// total moved onto it isn't missing until the total changes again.
export function createTrayBadges<K extends BadgeKey = BadgeKey>(
  d: TrayBadgeDeps<K>,
): { show(total: number): Promise<void> } {
  const sent = new Set<K>()
  let last: BadgeKey | null = null
  const drawn = d.drawn ?? ((_k: BadgeKey): _k is K => true)
  return {
    async show(total) {
      const key = badgeKey(total)
      if (key === last) return
      last = key
      if (!drawn(key) || sent.has(key)) return
      sent.add(key)
      let ok = false
      try {
        await d.ready()
        const url = d.paint(key)
        ok = url !== null && (await d.send({ [key]: url } as Partial<Record<K, string>>))
      } catch {
        ok = false
      }
      if (!ok) {
        sent.delete(key)
        if (last === key) last = null
      }
    },
  }
}

// Colours: the tile and mark are the app icon's own (resources/icon.svg); the badge is the theme's
// accent-strong, which carries white text at 5.2:1 (accent itself is only 3.7:1).
const TILE = '#18181b'
const MARK = '#fafafa'
const BADGE_TEXT = '#ffffff'
const FALLBACK_ACCENT_STRONG = '#2563eb'

function token(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

const BADGE_FONT = (px: number) => `700 ${px}px Inter, sans-serif`

// The Windows taskbar overlay (src/main/taskbar-badge.ts): the badge alone, a 16 px accent-strong
// disc with the count, which Windows draws over the corner of the taskbar button. Nothing at 0.
export const OVERLAY_SIZE = 16

const isOverlayKey = (k: BadgeKey): k is OverlayKey => k !== 'none'

export function paintOverlayBadge(key: OverlayKey): string | null {
  const canvas = document.createElement('canvas')
  canvas.width = OVERLAY_SIZE
  canvas.height = OVERLAY_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const c = OVERLAY_SIZE / 2
  ctx.fillStyle = token('--color-accent-strong', FALLBACK_ACCENT_STRONG)
  ctx.beginPath()
  ctx.arc(c, c, c, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = BADGE_TEXT
  ctx.font = BADGE_FONT(key.length > 1 ? 8 : 11)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(key, c, c + 0.5)
  return canvas.toDataURL('image/png')
}

export function paintTrayBadge(key: BadgeKey): string | null {
  const canvas = document.createElement('canvas')
  canvas.width = BADGE_SIZE
  canvas.height = BADGE_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const S = BADGE_SIZE

  ctx.fillStyle = TILE
  ctx.beginPath()
  ctx.roundRect(1, 1, S - 2, S - 2, 8)
  ctx.fill()
  ctx.save()
  ctx.translate(4, 4)
  ctx.scale((S - 8) / 24, (S - 8) / 24)
  ctx.strokeStyle = MARK
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const d of MARK_PATHS) ctx.stroke(new Path2D(d))
  ctx.restore()

  const label = key === 'none' ? null : key
  if (label) {
    const wide = label.length > 1
    const r = wide ? 9 : 8
    const cx = S - r
    const cy = r
    // A transparent gap around the badge keeps it apart from the tile on any bar colour.
    ctx.save()
    ctx.globalCompositeOperation = 'destination-out'
    ctx.beginPath()
    ctx.arc(cx, cy, r + 1.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    ctx.fillStyle = token('--color-accent-strong', FALLBACK_ACCENT_STRONG)
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = BADGE_TEXT
    ctx.font = BADGE_FONT(wide ? 10 : 12)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, cx, cy + 0.5)
  }
  return canvas.toDataURL('image/png')
}

// The bundled Inter 700 loads only once something asks for it (unicode-range font faces): ask, so
// the first badge isn't drawn in a fallback face. Never rejects.
async function fontReady(): Promise<void> {
  try {
    await document.fonts?.load(BADGE_FONT(12), '0123456789+')
  } catch {
    // a fallback face is still a readable badge
  }
}

let shared: { show(total: number): Promise<void> } | null = null

// The app's one badge cache, sending through the shell API without toasts: a tray that can't take
// an image is not worth interrupting anyone for.
export function trayBadges(): { show(total: number): Promise<void> } {
  shared ??= createTrayBadges({
    ready: fontReady,
    paint: paintTrayBadge,
    send: (images) =>
      window.diwan.invoke('tray:setBadges', images).then(
        () => true,
        () => false,
      ),
  })
  return shared
}

let overlay: { show(total: number): Promise<void> } | null = null

// The taskbar overlay's cache (Windows only; App calls it there). Same rules as the tray's.
export function overlayBadges(): { show(total: number): Promise<void> } {
  overlay ??= createTrayBadges<OverlayKey>({
    ready: fontReady,
    paint: paintOverlayBadge,
    drawn: isOverlayKey,
    send: (images) =>
      window.diwan.invoke('taskbar:setBadges', images).then(
        () => true,
        () => false,
      ),
  })
  return overlay
}
