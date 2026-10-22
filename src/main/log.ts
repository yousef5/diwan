import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

export interface Logger {
  info(msg: string, extra?: unknown): void
  warn(msg: string, extra?: unknown): void
  error(msg: string, extra?: unknown): void
}

const KEEP = 3

const MAX_MESSAGE = 200
const MAX_EXTRA = 500
const MAX_FRAMES = 8

// Error messages (ZodError, JSON.parse...) can embed chat text, so they are never logged raw.
function safeMessage(message: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters is the point
  return Array.from(message.replace(/[\u0000-\u001f\u007f]/g, ' '))
    .slice(0, MAX_MESSAGE)
    .join('')
}

// Up to 8 "    at fn (file:line:col)" frames, each on its own line. Frames hold code locations, never
// message text: the header (name + message, which may span lines) is cut off before looking. A stack
// whose header isn't exactly `name: message` gives no frames, since a message line starting with
// "    at " could not be told apart from a real frame.
function stackFrames(e: Error): string {
  if (typeof e.stack !== 'string') return ''
  const head = e.message ? `${e.name}: ${e.message}` : e.name
  if (!e.stack.startsWith(head)) return ''
  const frames = e.stack
    .slice(head.length)
    .split('\n')
    .filter((l) => l.startsWith('    at '))
    .slice(0, MAX_FRAMES)
    .map((l) => `\n    ${safeMessage(l.slice(4))}`)
  return frames.join('')
}

function isZodLike(x: unknown): x is { issues: { path: unknown[]; code: string }[] } {
  const o = x as { name?: unknown; issues?: unknown }
  return typeof x === 'object' && x !== null && o.name === 'ZodError' && Array.isArray(o.issues)
}

function formatExtra(extra: unknown): string {
  if (extra === undefined) return ''
  try {
    if (isZodLike(extra)) {
      return ` ZodError: ${extra.issues.map((i) => `${i.path.join('.') || '(root)'}:${i.code}`).join(', ')}`
    }
    if (extra instanceof Error) {
      const cause = extra.cause instanceof Error ? ` (cause: ${extra.cause.name})` : ''
      return ` ${extra.name}: ${safeMessage(extra.message)}${cause}${stackFrames(extra)}`
    }
    return ` ${JSON.stringify(extra).slice(0, MAX_EXTRA)}`
  } catch {
    return ' [unserialisable]'
  }
}

// Plain rotating file log in <userData>/logs. Callers never pass message text, only metadata.
export function createLogger(dir: string, opts: { maxBytes?: number; echo?: boolean } = {}): Logger {
  const maxBytes = opts.maxBytes ?? 1_000_000
  const echo = opts.echo ?? true
  const file = join(dir, 'main.log')
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 })
  } catch {}

  const rotate = () => {
    try {
      if (statSync(file).size < maxBytes) return
    } catch {
      return
    }
    rmSync(`${file}.${KEEP}`, { force: true })
    for (let i = KEEP - 1; i >= 1; i--)
      if (existsSync(`${file}.${i}`)) renameSync(`${file}.${i}`, `${file}.${i + 1}`)
    renameSync(file, `${file}.1`)
  }

  const write = (level: 'info' | 'warn' | 'error', msg: string, extra?: unknown) => {
    const line = `${new Date().toISOString()} ${level} ${msg}${formatExtra(extra)}\n`
    try {
      rotate()
      appendFileSync(file, line, { mode: 0o600 })
    } catch {}
    if (echo) (level === 'error' ? console.error : console.log)(line.trimEnd())
  }

  return {
    info: (m, e) => write('info', m, e),
    warn: (m, e) => write('warn', m, e),
    error: (m, e) => write('error', m, e),
  }
}
