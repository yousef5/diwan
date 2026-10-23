import { constants, lstatSync, readdirSync, unlinkSync } from 'node:fs'
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

// Windows device names, reserved with any extension ("con.txt" opens the console).
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\s*)(?=\.|$)/i

// Safe on every OS: Windows-only rules apply everywhere, so a name never depends on where it lands.
export function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[/\\<>:"|?*]|[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '_')
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .replace(RESERVED, '$1_$2')
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

export interface FinalizeFs {
  linkSync(existing: string, target: string): void
  unlinkSync(p: string): void
  copyFileSync(src: string, dest: string, mode?: number): void
  // lstat-based: a dangling symlink counts as taken
  exists(p: string): boolean
}

export function lstatExists(p: string): boolean {
  try {
    lstatSync(p)
    return true
  } catch {
    return false
  }
}

const codeOf = (e: unknown) => (e as NodeJS.ErrnoException).code

// Hard-links (or, if linking is unsupported, copies) the finished staging file to a free final
// name; neither ever overwrites. The staging file is removed only after that succeeded, so a
// finished download is never lost. Returns the final path, or null (stage file kept, onError told).
export function finalizeDownload(
  stage: string,
  dir: string,
  wantedName: string,
  fs: FinalizeFs,
  onError: (message: string, e?: unknown) => void = () => {},
): string | null {
  const tried = new Set<string>()
  let lastError: unknown
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = uniquePath(dir, wantedName, (p) => tried.has(p) || fs.exists(p))
    tried.add(candidate)
    let done = false
    try {
      fs.linkSync(stage, candidate)
      done = true
    } catch (e) {
      if (codeOf(e) === 'EEXIST') continue
      try {
        fs.copyFileSync(stage, candidate, constants.COPYFILE_EXCL)
        done = true
      } catch (c) {
        lastError = c
        if (codeOf(c) === 'EEXIST') continue
        break
      }
    }
    if (done) {
      try {
        fs.unlinkSync(stage)
      } catch {
        // leftover stage is swept later
      }
      return candidate
    }
  }
  onError(`could not save finished download; kept at ${stage}`, lastError)
  return null
}

// Removes old .diwan-*.part(.crdownload) regular files in one folder; never follows symlinks.
export function sweepStaleDownloadParts(downloadsDir: string, maxAgeMs = 86_400_000, now = Date.now()): void {
  let names: string[]
  try {
    names = readdirSync(downloadsDir)
  } catch {
    return
  }
  for (const name of names) {
    if (!/^\.diwan-.+\.part(\.crdownload)?$/.test(name)) continue
    const p = join(downloadsDir, name)
    try {
      const st = lstatSync(p)
      if (st.isFile() && now - st.mtimeMs > maxAgeMs) unlinkSync(p)
    } catch {
      // best effort
    }
  }
}
