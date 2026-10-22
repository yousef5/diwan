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

export type LoadSource = 'file' | 'backup' | 'default'

// One writer, in main. Saves go: write .tmp → fsync → copy the current good file to .bak → rename.
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
  private _recovery = false
  private _source: LoadSource = 'default'
  private readonly fs: StoreFs

  constructor(
    dir: string,
    private readonly debounceMs = 300,
    private readonly onError?: (e: unknown) => void,
    fsOverrides: Partial<StoreFs> = {},
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
    this.clearTimer()
    if (this.dirty) this.writeNow()
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
    this.writeNow()
  }

  private load(): DiwanFile {
    // A file written by a newer Diwan is never read through a backup or overwritten (no downgrade).
    if (this.isNewer(this.path) || this.isNewer(this.backupPath)) {
      this._recovery = true
      this._source = 'default'
      return defaultFile()
    }
    const mainExists = this.fs.existsSync(this.path)
    const main = mainExists ? this.readParsed(this.path) : undefined
    if (main) {
      this._source = 'file'
      this.mainGood = true
      return main
    }
    const backup = this.fs.existsSync(this.backupPath) ? this.readParsed(this.backupPath) : undefined
    if (backup) {
      this._source = 'backup'
      // Keep the damaged main for forensics; never let a save overwrite it.
      if (mainExists) {
        try {
          this.fs.renameSync(this.path, `${this.path}.broken-${stamp()}`)
        } catch {}
      }
      return backup
    }
    this._source = 'default'
    if (main === null || backup === null) this._recovery = true
    return defaultFile()
  }

  private isNewer(p: string): boolean {
    if (!this.fs.existsSync(p)) return false
    try {
      migrate(JSON.parse(this.fs.readFileSync(p, 'utf8')))
      return false
    } catch (e) {
      return e instanceof NewerSchemaError
    }
  }

  // undefined = absent (handled by caller), null = present but unusable
  private readParsed(p: string): DiwanFile | null {
    try {
      return parseDiwanFile(migrate(JSON.parse(this.fs.readFileSync(p, 'utf8'))))
    } catch {
      return null
    }
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  private schedule(): void {
    if (this.debounceMs === 0) {
      this.writeNow()
      return
    }
    this.clearTimer()
    this.arm(this.debounceMs)
  }

  private arm(delay: number): void {
    this.timer = setTimeout(() => {
      this.timer = null
      try {
        this.writeNow()
      } catch (e) {
        this.failures++
        try {
          this.onError?.(e)
        } catch {}
        this.arm(Math.min(MAX_BACKOFF_MS, 1000 * 2 ** (this.failures - 1)))
      }
    }, delay)
  }

  // Main is only ever renamed into place after a verified read-back, so mainGood is trustworthy.
  private writeNow(): void {
    if (this._recovery || !this.dirty) return
    const text = `${JSON.stringify(this.data, null, 2)}\n`
    const tmp = `${this.path}.tmp`
    this.fs.rmSync(tmp, { force: true })
    this.fs.writeFileSync(tmp, text, { mode: 0o600, flush: true })
    parseDiwanFile(migrate(JSON.parse(this.fs.readFileSync(tmp, 'utf8'))))
    if (this.mainGood && this.fs.existsSync(this.path)) {
      // Rotate the current good main into .bak atomically, by hard link (no copy, never half-written).
      const bakTmp = `${this.backupPath}.tmp`
      this.fs.rmSync(bakTmp, { force: true })
      this.fs.linkSync(this.path, bakTmp)
      this.fs.renameSync(bakTmp, this.backupPath)
    }
    this.fs.renameSync(tmp, this.path)
    this.fsyncDir()
    this.mainGood = true
    this.dirty = false
    this.failures = 0
  }

  private fsyncDir(): void {
    const fd = this.fs.openSync(dirname(this.path), 'r')
    try {
      this.fs.fsyncSync(fd)
    } finally {
      this.fs.closeSync(fd)
    }
  }
}
