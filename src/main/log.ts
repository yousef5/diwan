import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

export interface Logger {
  info(msg: string, extra?: unknown): void
  warn(msg: string, extra?: unknown): void
  error(msg: string, extra?: unknown): void
}

const KEEP = 3

function formatExtra(extra: unknown): string {
  if (extra === undefined) return ''
  if (extra instanceof Error) return ` ${extra.name}: ${extra.message}`
  try {
    return ` ${JSON.stringify(extra)}`
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
    mkdirSync(dir, { recursive: true })
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
      appendFileSync(file, line)
    } catch {}
    if (echo) (level === 'error' ? console.error : console.log)(line.trimEnd())
  }

  return {
    info: (m, e) => write('info', m, e),
    warn: (m, e) => write('warn', m, e),
    error: (m, e) => write('error', m, e),
  }
}
