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
  if (!i.showPreview) return { title: i.accountName, body: 'New message' }
  return { title: `${i.accountName} · ${i.title.trim() || 'WhatsApp'}`, body: i.body }
}
