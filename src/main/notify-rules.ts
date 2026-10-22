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

export function formatNotification(i: {
  accountName: string
  title: string
  body: string
  showPreview: boolean
}): {
  title: string
  body: string
} {
  const account = `\u2068${i.accountName.trim() || 'WhatsApp'}\u2069`
  if (!i.showPreview) return { title: account, body: 'New message' }
  const sender = `\u2068${i.title.trim() || 'WhatsApp'}\u2069`
  const body = i.body.replace(/\s+/g, ' ').trim().slice(0, 200) || 'New message'
  return { title: `${account} · ${sender}`, body }
}
