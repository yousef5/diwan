import { dirname, join, resolve } from 'node:path'

const MAX_NAME_BYTES = 255
const SUFFIX_RESERVE = 8 // room for " (9999)"
const MAX_EXT_BYTES = 16
const MAX_SUFFIX_N = 9999

const byteLength = (s: string): number => Buffer.byteLength(s, 'utf8')

// Splits at the last dot; the extension is kept only if it is non-empty and short.
function splitName(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf('.')
  if (dot > 0 && dot < name.length - 1) {
    const ext = name.slice(dot)
    if (byteLength(ext) <= MAX_EXT_BYTES) return { base: name.slice(0, dot), ext }
  }
  return { base: name, ext: '' }
}

// Truncates the base on a code-point boundary so base + ext + reserve fits in 255 bytes.
function fitBase(base: string, ext: string, reserve: number): string {
  const budget = MAX_NAME_BYTES - byteLength(ext) - reserve
  let used = 0
  let out = ''
  for (const ch of Array.from(base)) {
    const n = byteLength(ch)
    if (used + n > budget) break
    used += n
    out += ch
  }
  return out
}

export function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[/\\]|[\p{Cc}\p{Cf}]/gu, '_')
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, '')
  if (!cleaned || cleaned === '.' || cleaned === '..') return 'download'
  const { base, ext } = splitName(cleaned)
  return `${fitBase(base, ext, SUFFIX_RESERVE)}${ext}` || 'download'
}

export function uniquePath(dir: string, filename: string, exists: (p: string) => boolean): string {
  const clean = sanitizeFilename(filename)
  const { base, ext } = splitName(clean)
  let candidate = join(dir, clean)
  for (let n = 1; exists(candidate); n++) {
    candidate =
      n <= MAX_SUFFIX_N
        ? join(dir, `${base} (${n})${ext}`)
        : join(dir, `${fitBase(base, ext, 20)} (${Date.now()})${ext}`)
    if (n > MAX_SUFFIX_N) break
  }
  if (dirname(resolve(candidate)) !== resolve(dir)) {
    throw new Error('download path escaped its folder')
  }
  return candidate
}
