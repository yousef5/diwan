export const WA_ORIGIN = 'https://web.whatsapp.com'

export type LinkAction =
  | { kind: 'internal' }
  | { kind: 'chat'; url: string }
  | { kind: 'external'; url: string }
  | { kind: 'download'; url: string }
  | { kind: 'blocked'; reason: string }

// A chat link only opens the chat (with optional draft text). Nothing is ever sent.
export function chatUrl(phone: string | null, text: string | null): string {
  const params = new URLSearchParams()
  const digits = phone?.replace(/\D/g, '')
  if (digits) params.set('phone', digits)
  if (text) params.set('text', text)
  const query = params.toString()
  return `${WA_ORIGIN}/send${query ? `?${query}` : ''}`
}

export function classifyLink(raw: string): LinkAction {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return { kind: 'blocked', reason: 'invalid url' }
  }

  switch (u.protocol) {
    case 'whatsapp:':
      if (u.host === 'send' || u.pathname.replace(/^\/+/, '') === 'send') {
        return { kind: 'chat', url: chatUrl(u.searchParams.get('phone'), u.searchParams.get('text')) }
      }
      return { kind: 'blocked', reason: 'unsupported whatsapp: link' }
    case 'blob:':
      return u.origin === WA_ORIGIN
        ? { kind: 'download', url: raw }
        : { kind: 'blocked', reason: 'foreign blob' }
    case 'mailto:':
    case 'tel:':
      return { kind: 'external', url: raw }
    case 'http:':
    case 'https:':
      break
    default:
      return { kind: 'blocked', reason: `scheme ${u.protocol}` }
  }

  const host = u.hostname.toLowerCase()
  if (u.protocol === 'https:' && host === 'web.whatsapp.com') {
    if (u.pathname === '/send' || u.pathname.startsWith('/send/')) {
      return { kind: 'chat', url: chatUrl(u.searchParams.get('phone'), u.searchParams.get('text')) }
    }
    return { kind: 'internal' }
  }
  if (host === 'wa.me' || host === 'www.wa.me') {
    const m = u.pathname.match(/^\/(\+?\d{6,15})\/?$/)
    if (m) return { kind: 'chat', url: chatUrl(m[1], u.searchParams.get('text')) }
    return { kind: 'external', url: u.href }
  }
  const isWaHost = host === 'api.whatsapp.com' || host === 'whatsapp.com' || host === 'www.whatsapp.com'
  if (isWaHost && u.pathname.replace(/\/$/, '') === '/send') {
    return { kind: 'chat', url: chatUrl(u.searchParams.get('phone'), u.searchParams.get('text')) }
  }
  return { kind: 'external', url: u.href }
}
