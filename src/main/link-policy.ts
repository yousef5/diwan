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

const MAILTO_KEYS = ['to', 'cc', 'bcc', 'subject', 'body']

// Drop everything but the address and plain compose fields: mail clients have honoured
// ?attach= / ?attachment= to attach local files. The kept query parts stay byte-for-byte
// as written, because in a mailto link '+' is a literal plus (not a space).
function safeMailto(u: URL): string | null {
  try {
    const address = decodeURIComponent(u.pathname)
    if (address.includes('?') || address.includes('&')) return null
  } catch {
    return null
  }
  const parts = u.search
    .slice(1)
    .split('&')
    .filter((part) => {
      try {
        return MAILTO_KEYS.includes(decodeURIComponent(part.split('=')[0]).toLowerCase())
      } catch {
        return false
      }
    })
  return `mailto:${u.pathname}${parts.length ? `?${parts.join('&')}` : ''}`
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
        ? { kind: 'download', url: u.href }
        : { kind: 'blocked', reason: 'foreign blob' }
    case 'mailto:': {
      const url = safeMailto(u)
      return url ? { kind: 'external', url } : { kind: 'blocked', reason: 'mailto address' }
    }
    case 'tel:':
      return { kind: 'external', url: u.href }
    case 'http:':
    case 'https:':
      break
    default:
      return { kind: 'blocked', reason: `scheme ${u.protocol}` }
  }

  const host = u.hostname.toLowerCase()
  const plainOrigin = u.port === '' && !u.username && !u.password
  if (u.protocol === 'https:' && host === 'web.whatsapp.com' && plainOrigin) {
    if (u.pathname === '/send' || u.pathname.startsWith('/send/')) {
      return { kind: 'chat', url: chatUrl(u.searchParams.get('phone'), u.searchParams.get('text')) }
    }
    return { kind: 'internal' }
  }
  if (plainOrigin && (host === 'wa.me' || host === 'www.wa.me')) {
    const m = u.pathname.match(/^\/(\+?\d{6,15})\/?$/)
    if (m) return { kind: 'chat', url: chatUrl(m[1], u.searchParams.get('text')) }
    return { kind: 'external', url: u.href }
  }
  const isWaHost = host === 'api.whatsapp.com' || host === 'whatsapp.com' || host === 'www.whatsapp.com'
  if (plainOrigin && isWaHost && u.pathname.replace(/\/$/, '') === '/send') {
    return { kind: 'chat', url: chatUrl(u.searchParams.get('phone'), u.searchParams.get('text')) }
  }
  return { kind: 'external', url: u.href }
}
