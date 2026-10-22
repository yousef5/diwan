import { randomUUID } from 'node:crypto'
import { constants, existsSync, readdirSync, readFileSync, readlinkSync, statSync } from 'node:fs'
import { cp, rm } from 'node:fs/promises'
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
  listDir: (p) => {
    try {
      return readdirSync(p)
    } catch {
      return []
    }
  },
  dirSize,
}

// Chromium keeps <userData>/SingletonLock → "<hostname>-<pid>" while the app runs.
export function nexusRunning(
  nexusUserData: string,
  pidAlive = (pid: number) => existsSync(`/proc/${pid}`),
): boolean {
  try {
    const target = readlinkSync(join(nexusUserData, 'SingletonLock'))
    const pid = Number(target.split('-').pop())
    return Number.isInteger(pid) && pid > 0 && pidAlive(pid)
  } catch {
    return false
  }
}

// Copies each session folder (reflink on btrfs, so instant) into a new partition, then
// registers the account. Nexus's files are only read.
export async function applyImport(
  plan: ImportPlan,
  d: { hub: StateHub; partitionsDir: string; setupSession(id: string): void; log: Logger },
): Promise<ImportResult> {
  const result: ImportResult = { imported: [], failed: [] }
  for (const item of plan.items) {
    const id = randomUUID()
    const dest = join(d.partitionsDir, `acc-${id}`)
    try {
      await cp(item.sourceDir, dest, {
        recursive: true,
        errorOnExist: true,
        force: false,
        mode: constants.COPYFILE_FICLONE,
      })
      d.setupSession(id)
      d.hub.addAccount(item.name, item.color, id)
      result.imported.push(item.name)
      d.log.info('imported account from Nexus', { id })
    } catch (e) {
      await rm(dest, { recursive: true, force: true })
      result.failed.push({ name: item.name, error: e instanceof Error ? e.message : String(e) })
      d.log.error('import failed', e)
    }
  }
  if (result.imported.length > 0) d.hub.markImported()
  return result
}
