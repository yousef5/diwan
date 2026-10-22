import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeSync,
} from 'node:fs'
import { join } from 'node:path'
import type { DiwanFile } from '../../shared/types'
import { migrate, NewerSchemaError } from './migrate'
import { defaultFile, parseDiwanFile } from './schema'

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
  private _recovery = false
  private _source: LoadSource = 'default'

  constructor(
    dir: string,
    private readonly debounceMs = 300,
  ) {
    mkdirSync(dir, { recursive: true })
    this.path = join(dir, 'diwan.json')
    this.backupPath = `${this.path}.bak`
    this.data = this.load()
  }

  get recovery(): boolean {
    return this._recovery
  }

  get source(): LoadSource {
    return this._source
  }

  get(): DiwanFile {
    return this.data
  }

  update(mutator: (draft: DiwanFile) => void): void {
    if (this._recovery) throw new Error('settings are in recovery mode and cannot be changed')
    const draft = structuredClone(this.data)
    mutator(draft)
    this.data = parseDiwanFile(draft)
    this.schedule()
  }

  flush(): void {
    if (!this.timer) return
    clearTimeout(this.timer)
    this.timer = null
    this.writeNow()
  }

  startFresh(): void {
    const stamp = Date.now()
    if (existsSync(this.path)) renameSync(this.path, `${this.path}.broken-${stamp}`)
    if (existsSync(this.backupPath)) renameSync(this.backupPath, `${this.backupPath}.broken-${stamp}`)
    this._recovery = false
    this.mainGood = false
    this.data = defaultFile()
    this.writeNow()
  }

  private load(): DiwanFile {
    // A file written by a newer Diwan is never read through a backup or overwritten (no downgrade).
    if (this.isNewer(this.path) || this.isNewer(this.backupPath)) {
      this._recovery = true
      this._source = 'default'
      return defaultFile()
    }
    const main = existsSync(this.path) ? this.readParsed(this.path) : undefined
    if (main) {
      this._source = 'file'
      this.mainGood = true
      return main
    }
    const backup = existsSync(this.backupPath) ? this.readParsed(this.backupPath) : undefined
    if (backup) {
      this._source = 'backup'
      return backup
    }
    this._source = 'default'
    if (main === null || backup === null) this._recovery = true
    return defaultFile()
  }

  private isNewer(p: string): boolean {
    if (!existsSync(p)) return false
    try {
      migrate(JSON.parse(readFileSync(p, 'utf8')))
      return false
    } catch (e) {
      return e instanceof NewerSchemaError
    }
  }

  // undefined = absent (handled by caller), null = present but unusable
  private readParsed(p: string): DiwanFile | null {
    try {
      return parseDiwanFile(migrate(JSON.parse(readFileSync(p, 'utf8'))))
    } catch {
      return null
    }
  }

  private schedule(): void {
    if (this.debounceMs === 0) {
      this.writeNow()
      return
    }
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      this.writeNow()
    }, this.debounceMs)
  }

  private writeNow(): void {
    if (this._recovery) return
    const tmp = `${this.path}.tmp`
    const fd = openSync(tmp, 'w')
    try {
      writeSync(fd, `${JSON.stringify(this.data, null, 2)}\n`)
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    if (this.mainGood) copyFileSync(this.path, this.backupPath)
    renameSync(tmp, this.path)
    this.mainGood = true
  }
}
