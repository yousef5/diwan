import type { Account, AccountRuntime } from './types'

// Arabic-Indic (U+0660–0669) and Extended Arabic-Indic (U+06F0–06F9) digits → ASCII.
const NON_ASCII_DIGITS = /[٠-٩۰-۹]/g

export function toAsciiDigits(s: string): string {
  return s.replace(NON_ASCII_DIGITS, (d) => String(d.charCodeAt(0) & 0xf))
}

// WhatsApp Web puts the unread count in the page title: "(3) WhatsApp", "(٣) واتساب".
export function parseUnread(title: string): number {
  const m = toAsciiDigits(title).match(/\((\d{1,5})\)/)
  return m ? Number(m[1]) : 0
}

export function unreadTotal(accounts: Account[], runtime: Record<string, AccountRuntime>): number {
  let total = 0
  for (const a of accounts) if (!a.muted) total += runtime[a.id]?.unread ?? 0
  return total
}

export const BADGE_KEYS = ['none', '1', '2', '3', '4', '5', '6', '7', '8', '9', '9+'] as const
export type BadgeKey = (typeof BADGE_KEYS)[number]

export function badgeKey(total: number): BadgeKey {
  if (total <= 0) return 'none'
  if (total > 9) return '9+'
  return String(total) as BadgeKey
}

export function windowTitle(total: number): string {
  return total > 0 ? `Diwan (${total})` : 'Diwan'
}
