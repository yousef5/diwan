export interface NotifyContext {
  enabled: boolean
  muted: boolean
  windowFocused: boolean
  activeId: string | null
  accountId: string
}

export function shouldNotify(c: NotifyContext): boolean {
  return c.enabled && !c.muted && !(c.windowFocused && c.activeId === c.accountId)
}

// Control, bidi and invisible format characters. ZWNJ (U+200C), ZWJ (U+200D) and tag characters stay.
const STRIP = /[\p{Cc}\u061c\u200b\u200e\u200f\u202a-\u202e\u2060-\u2069\ufeff]/gu
const clean = (s: string) => s.replace(STRIP, ' ').replace(/\s+/g, ' ').trim()

export function formatNotification(i: {
  accountName: string
  title: string
  body: string
  showPreview: boolean
}): {
  title: string
  body: string
} {
  const account = `\u2068${clean(i.accountName) || 'WhatsApp'}\u2069`
  if (!i.showPreview) return { title: account, body: 'New message' }
  const sender = `\u2068${clean(i.title) || 'WhatsApp'}\u2069`
  const body = clean(i.body).slice(0, 200) || 'New message'
  return { title: `${account} · ${sender}`, body }
}
