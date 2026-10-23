import * as nodeFs from 'node:fs'
import { dirname, join } from 'node:path'
import type { DiwanFile } from '../../shared/types'
import { migrate, NewerSchemaError } from './migrate'
import { defaultFile, parseDiwanFile } from './schema'

// The fs calls the store uses, injectable so failures (short writes, full disk) can be simulated.
export type StoreFs = Pick<
  typeof nodeFs,
  | 'closeSync'
  | 'existsSync'
  | 'fsyncSync'
  | 'linkSync'
  | 'mkdirSync'
  | 'openSync'
  | 'readFileSync'
  | 'renameSync'
  | 'rmSync'
  | 'writeFileSync'
>

export type DeepReadonly<T> = T extends (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T

function deepFreeze<T>(v: T): T {
  if (typeof v === 'object' && v !== null && !Object.isFrozen(v)) {
    Object.freeze(v)
    for (const x of Object.values(v)) deepFreeze(x)
  }
  return v
}

const stamp = () => `${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 6)}`
const MAX_BACKOFF_MS = 30_000
const backoff = (failures: number) => Math.min(MAX_BACKOFF_MS, 1000 * 2 ** (failures - 1))
const LINK_FALLBACK_CODES = new Set(['EPERM', 'ENOTSUP', 'EXDEV', 'EMLINK'])
// A directory can't be opened or fsynced everywhere (Windows, some network and FUSE file systems).
const DIR_FSYNC_UNSUPPORTED = new Set(['EPERM', 'EISDIR', 'EINVAL', 'EBADF'])
const dirFsyncUnsupported = (e: unknown) =>
  DIR_FSYNC_UNSUPPORTED.has((e as NodeJS.ErrnoException)?.code ?? '')

type Probe = { kind: 'absent' | 'io' | 'newer' | 'bad' } | { kind: 'good'; file: DiwanFile }

export type LoadSource = 'file' | 'backup' | 'default'

// One writer, in main. Saves go: write .tmp (fsync) → verify read-back → rotate the current good main into .bak (hard link,
// copy as fallback) → rename .tmp into place → fsync the directory.
// A damaged file is never overwritten: if neither diwan.json nor .bak parses, the store is
// read-only (recovery mode) until the user picks "Start fresh".
export class Store {
  readonly path: string
  readonly backupPath: string
  private data: DiwanFile
  private timer: ReturnType<typeof setTimeout> | null = null
  private mainGood = false
  private dirty = false
  private failures = 0
  private flushing = false
  private _recovery = false
  private _source: LoadSource = 'default'
  private readonly fs: StoreFs

  constructor(
    dir: string,
    private readonly debounceMs = 300,
    private readonly onError?: (e: unknown) => void,
    fsOverrides: Partial<StoreFs> = {},
    private readonly platform: NodeJS.Platform = process.platform,
  ) {
    this.fs = { ...nodeFs, ...fsOverrides }
    this.fs.mkdirSync(dir, { recursive: true })
    this.path = join(dir, 'diwan.json')
    this.backupPath = `${this.path}.bak`
    this.data = deepFreeze(this.load())
  }

  get recovery(): boolean {
    return this._recovery
  }

  get source(): LoadSource {
    return this._source
  }

  get(): DeepReadonly<DiwanFile> {
    return this.data
  }

  update(mutator: (draft: DiwanFile) => void): void {
    if (this._recovery) throw new Error('settings are in recovery mode and cannot be changed')
    const draft = structuredClone(this.data) as DiwanFile
    mutator(draft)
    this.data = deepFreeze(parseDiwanFile(draft))
    this.dirty = true
    this.schedule()
  }

  // Writes any pending change now. May throw; the change stays pending so the next call retries.
  flush(): void {
    if (this.flushing) return
    this.clearTimer()
    if (this.dirty) this.save()
  }

  startFresh(): void {
    if (!this._recovery) throw new Error('startFresh is only allowed in recovery mode')
    this.clearTimer()
    const mark = stamp()
    if (this.fs.existsSync(this.path)) this.fs.renameSync(this.path, `${this.path}.broken-${mark}`)
    if (this.fs.existsSync(this.backupPath))
      this.fs.renameSync(this.backupPath, `${this.backupPath}.broken-${mark}`)
    this._recovery = false
    this.mainGood = false
    this.data = deepFreeze(defaultFile())
    this.dirty = true
    this.save()
  }

  private probe(p: string): Probe {
    let text: string
    try {
      text = this.fs.readFileSync(p, 'utf8')
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return { kind: 'absent' }
      return { kind: 'io' }
    }
    try {
      return { kind: 'good', file: parseDiwanFile(migrate(JSON.parse(text))) }
    } catch (e) {
      return { kind: e instanceof NewerSchemaError ? 'newer' : 'bad' }
    }
  }

  private load(): DiwanFile {
    const main = this.probe(this.path)
    const bak = this.probe(this.backupPath)
    const recover = (): DiwanFile => {
      this._recovery = true
      this._source = 'default'
      return defaultFile()
    }
    // A newer-schema file (no downgrade) or an unreadable main always means recovery; nothing is moved.
    if (main.kind === 'io' || main.kind === 'newer' || bak.kind === 'newer') return recover()
    // .bak is always older than main, so a good main loads even if .bak is unreadable or bad.
    if (main.kind === 'good') {
      this._source = 'file'
      this.mainGood = true
      return main.file
    }
    if (bak.kind === 'io') return recover()
    if (bak.kind === 'good') {
      if (main.kind === 'bad') {
        // Keep the damaged main for forensics; if that fails, a later save would overwrite it.
        try {
          this.fs.renameSync(this.path, `${this.path}.broken-${stamp()}`)
        } catch {
          return recover()
        }
      }
      this._source = 'backup'
      return bak.file
    }
    this._source = 'default'
    if (main.kind === 'bad' || bak.kind === 'bad') this._recovery = true
    return defaultFile()
  }

  private report(e: unknown): void {
    try {
      this.onError?.(e)
    } catch {}
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  private schedule(): void {
    if (this.debounceMs === 0) {
      this.save()
      return
    }
    this.clearTimer()
    this.arm(this.debounceMs, false)
  }

  private arm(delay: number, retry: boolean): void {
    this.clearTimer()
    this.timer = setTimeout(() => {
      this.timer = null
      try {
        this.save()
      } catch {} // already reported and re-armed by save()
    }, delay)
    // Only a retry timer may not keep the process alive; the debounce must run to completion.
    if (retry) this.timer?.unref?.()
  }

  // Writes and handles failure: report, re-arm with backoff, rethrow. Not re-entrant.
  private save(): void {
    if (this.flushing) return
    this.flushing = true
    try {
      this.writeNow()
      this.failures = 0
    } catch (e) {
      this.failures++
      this.arm(backoff(this.failures), true)
      this.report(e)
      throw e
    } finally {
      this.flushing = false
    }
  }

  // Main is only ever renamed into place after a verified read-back, so mainGood is trustworthy.
  private writeNow(): void {
    if (this._recovery || !this.dirty) return
    const text = `${JSON.stringify(this.data, null, 2)}\n`
    const tmp = `${this.path}.tmp`
    this.fs.rmSync(tmp, { force: true })
    this.fs.writeFileSync(tmp, text, { mode: 0o600, flush: true })
    if (this.fs.readFileSync(tmp, 'utf8') !== text) throw new Error('read-back mismatch, not saving')
    if (this.mainGood) this.rotateBackup()
    this.fs.renameSync(tmp, this.path)
    this.fsyncDir()
    this.mainGood = true
    this.dirty = false
    this.failures = 0
  }

  // Rotate the current main into .bak, only if main still parses (else keep the old .bak).
  private rotateBackup(): void {
    let current: string
    try {
      current = this.fs.readFileSync(this.path, 'utf8')
      parseDiwanFile(migrate(JSON.parse(current)))
    } catch {
      return
    }
    const bakTmp = `${this.backupPath}.tmp`
    this.fs.rmSync(bakTmp, { force: true })
    try {
      this.fs.linkSync(this.path, bakTmp)
    } catch (e) {
      if (!LINK_FALLBACK_CODES.has((e as NodeJS.ErrnoException).code ?? '')) throw e
      this.fs.writeFileSync(bakTmp, current, { mode: 0o600, flush: true })
    }
    this.fs.renameSync(bakTmp, this.backupPath)
  }

  // Best effort: the rename is already done. Windows can't open a directory at all (EPERM), and
  // NTFS makes the rename durable on its own.
  private fsyncDir(): void {
    if (this.platform === 'win32') return
    let fd: number
    try {
      fd = this.fs.openSync(dirname(this.path), 'r')
    } catch (e) {
      if (dirFsyncUnsupported(e)) return
      throw e
    }
    try {
      this.fs.fsyncSync(fd)
    } catch (e) {
      if (!dirFsyncUnsupported(e)) throw e
    } finally {
      this.fs.closeSync(fd)
    }
  }
}
