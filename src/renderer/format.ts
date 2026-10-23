// Small display helpers for the shell. Pure: no React, no window.

// Two letters for an account tile. Split by grapheme, so an emoji (even a ZWJ family or a flag)
// is never cut in half and an Arabic letter keeps its harakat ("مُحمد" gives "مُح", not "مُ").
// toUpperCase leaves scripts without case (Arabic) alone.
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
const chars = (word: string) => Array.from(graphemes.segment(word), (s) => s.segment)

// The Arabic article "ال" (with any harakat on it) says nothing about a name: "العائلة" gives "عا",
// not the "ال" every such name would start with. A word that is little more than the article
// ("الف") keeps it.
const ARTICLE = /^ال\p{M}*/u
const stem = (word: string) => {
  const rest = word.replace(ARTICLE, '')
  return chars(rest).length >= 2 ? rest : word
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean).map(stem)
  if (words.length === 0) return '?'
  if (words.length === 1) return chars(words[0]).slice(0, 2).join('').toUpperCase()
  return (chars(words[0])[0] + chars(words[1])[0]).toUpperCase()
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
