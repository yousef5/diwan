import { createHash } from 'node:crypto'
import type { NativeImage } from 'electron'

// sha256 of the last picture saved per account, so the same WhatsApp picture isn't re-decoded
// and re-written. Forgotten whenever the picture is removed, so it can be saved again.
const lastAvatar = new Map<string, string>()

export function forgetAvatar(id: string): void {
  lastAvatar.delete(id)
}

export interface GuestAvatarDeps {
  account(id: string): { customAvatar: boolean } | undefined
  currentAvatar(id: string): string | null
  decode(dataUrl: string): NativeImage
  save(id: string, img: NativeImage): string | null
  setAvatar(id: string, url: string): void
}

export function handleGuestAvatar(id: string, dataUrl: string, d: GuestAvatarDeps): void {
  if (d.account(id)?.customAvatar) return
  const hash = createHash('sha256').update(dataUrl).digest('hex')
  if (lastAvatar.get(id) === hash && d.currentAvatar(id)) return
  const image = d.decode(dataUrl) // dimensions already capped by the schema
  if (image.isEmpty()) return
  const url = d.save(id, image)
  if (!url) return
  lastAvatar.set(id, hash)
  d.setAvatar(id, url)
}
