// Small display helpers for the shell. Pure: no React, no window.

// Two letters for an account tile. Array.from splits by code point, so an emoji or an astral
// letter is never cut in half.
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return Array.from(words[0]).slice(0, 2).join('').toUpperCase()
  return (Array.from(words[0])[0] + Array.from(words[1])[0]).toUpperCase()
}

const UNITS = ['KB', 'MB', 'GB', 'TB']

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  if (n < 1024) return `${Math.round(n)} B`
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < UNITS.length - 1) {
    v /= 1024
    i++
  }
  return `${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10} ${UNITS[i]}`
}

const FALLBACK = 'Something went wrong.'

// ipcRenderer.invoke rejects with "Error invoking remote method '<channel>': Error: <message>".
// Only the message is for the user.
export function cleanError(e: unknown): string {
  if (e === undefined || e === null) return FALLBACK
  const msg = e instanceof Error ? e.message : String(e)
  const clean = msg.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '').trim()
  return clean || FALLBACK
}
