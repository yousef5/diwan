import type { Snapshot } from '../shared/types'
import { STRIP } from './notify-rules'

// Tray menu labels go through dbusmenu: '&' is a mnemonic marker, so it is doubled; control and
// bidi characters are stripped and the name is isolated.
export function trayAccountLabel(name: string, unread: number, muted: boolean): string {
  const clean = name.replace(STRIP, ' ').replace(/\s+/g, ' ').trim() || 'WhatsApp'
  const safe = `⁨${clean.replace(/&/g, '&&')}⁩`
  return `${safe}${unread > 0 ? `  (${unread})` : ''}${muted ? '  · muted' : ''}`
}

export function trayMenuSignature(s: Snapshot): string {
  return JSON.stringify([
    s.accounts.map((a) => [a.id, a.name, a.muted, s.runtime[a.id]?.unread ?? 0]),
    s.settings.notifications.enabled,
  ])
}
