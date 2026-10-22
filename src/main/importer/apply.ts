import { randomUUID } from 'node:crypto'
import { constants, existsSync, lstatSync, readdirSync, readFileSync, readlinkSync, statSync } from 'node:fs'
import { cp, lstat, readdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { ImportPlan, ImportResult } from '../../shared/types'
import type { Logger } from '../log'
import type { StateHub } from '../state'
import type { PlanDeps } from './plan'

export function dirSize(path: string): number {
  let total = 0
  const walk = (dir: string) => {
    let entries: import('node:fs').Dirent[]
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const full = join(dir, e.name)
      if (e.isDirectory()) walk(full)
      else if (e.isFile()) {
        try {
          total += statSync(full).size
        } catch {}
      }
    }
  }
  walk(path)
  return total
}

export const fsPlanDeps: PlanDeps = {
  readText: (p) => {
    try {
      return readFileSync(p, 'utf8')
    } catch {
      return null
    }
  },
  // Only real directories: symlinks, FIFOs and files are never offered for import.
  listDir: (p) => {
    try {
      return readdirSync(p).filter((n) => {
        try {
          return lstatSync(join(p, n)).isDirectory()
        } catch {
          return false
        }
      })
    } catch {
      return []
    }
  },
  dirSize,
}

// Chromium keeps <userData>/SingletonLock -> "<hostname>-<pid>" while the app runs.
const NEXUS_COMM = /multiwhatsapp|electron|nexus/i
const readComm = (pid: number): string | null => {
  try {
    return readFileSync(`/proc/${pid}/comm`, 'utf8').trim()
  } catch {
    return null
  }
}

export function nexusRunning(
  nexusUserData: string,
  pidAlive = (pid: number) => existsSync(`/proc/${pid}`),
  commOf: (pid: number) => string | null = readComm,
): boolean {
  try {
    const target = readlinkSync(join(nexusUserData, 'SingletonLock'))
    const pid = Number(target.split('-').pop())
    if (!Number.isInteger(pid) || pid <= 0 || !pidAlive(pid)) return false
    const comm = commOf(pid)
    return comm === null ? true : NEXUS_COMM.test(comm)
  } catch {
    return false
  }
}

// Leftover half-copied sessions from a crash. Call once at startup.
export async function sweepPartials(partitionsDir: string): Promise<void> {
  let names: string[]
  try {
    names = await readdir(partitionsDir)
  } catch {
    return
  }
  for (const n of names) {
    if (n.endsWith('.partial'))
      await rm(join(partitionsDir, n), { recursive: true, force: true }).catch(() => {})
  }
}

let running = false

// Copies each session folder (reflink on btrfs, so instant) into acc-<id>.partial, renames it
// into place, then registers the account. Nexus's files are only read; symlinks are never followed.
export async function applyImport(
  plan: ImportPlan,
  d: {
    hub: StateHub
    partitionsDir: string
    setupSession(id: string): void
    log: Logger
    isNexusRunning?: () => boolean
    rm?: typeof rm
  },
): Promise<ImportResult> {
  if (d.hub.store.recovery) throw new Error('Diwan’s settings file is damaged; fix that before importing')
  if (running) throw new Error('An import is already running')
  running = true
  try {
    const remove = d.rm ?? rm
    const result: ImportResult = { imported: [], failed: [] }
    let done = 0
    for (const item of plan.items) {
      if (d.hub.accounts().some((a) => a.importedFrom === item.sourceId)) {
        done++
        continue
      }
      const id = randomUUID()
      const dest = join(d.partitionsDir, `acc-${id}`)
      const partial = `${dest}.partial`
      try {
        const st = await lstat(item.sourceDir)
        if (!st.isDirectory()) throw new Error('source is not a plain folder')
        await cp(item.sourceDir, partial, {
          recursive: true,
          errorOnExist: true,
          force: false,
          mode: constants.COPYFILE_FICLONE,
          filter: async (src) => {
            const s = await lstat(src)
            return s.isDirectory() || s.isFile()
          },
        })
        if (d.isNexusRunning?.()) throw new Error('Nexus started during the import; quit it and try again')
        await rename(partial, dest)
        try {
          d.setupSession(id)
          d.hub.addAccount(item.name, item.color, id, item.sourceId)
        } catch (e) {
          await remove(dest, { recursive: true, force: true }).catch((e2) =>
            d.log.warn('could not clean up a failed import copy', e2),
          )
          throw e
        }
        result.imported.push(item.name)
        done++
        d.log.info('imported account from Nexus', { id })
      } catch (e) {
        await remove(partial, { recursive: true, force: true }).catch((e2) =>
          d.log.warn('could not clean up a failed import copy', e2),
        )
        result.failed.push({ name: item.name, error: e instanceof Error ? e.message : String(e) })
        d.log.error('import failed', e)
      }
    }
    if (done > 0 && done === plan.items.length) d.hub.markImported()
    return result
  } finally {
    running = false
  }
}
