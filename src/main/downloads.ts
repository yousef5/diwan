import { join } from 'node:path'

export function sanitizeFilename(name: string): string {
  const s = name
    .replace(/[/\\\0]/g, '_')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 200)
  return s || 'download'
}

export function uniquePath(dir: string, filename: string, exists: (p: string) => boolean): string {
  const clean = sanitizeFilename(filename)
  const dot = clean.lastIndexOf('.')
  const base = dot > 0 ? clean.slice(0, dot) : clean
  const ext = dot > 0 ? clean.slice(dot) : ''
  let candidate = join(dir, clean)
  for (let n = 1; exists(candidate); n++) candidate = join(dir, `${base} (${n})${ext}`)
  return candidate
}
