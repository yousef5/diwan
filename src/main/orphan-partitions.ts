import { lstat, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { AccountId } from '../shared/validators'
import type { LoadSource } from './store/store'

const PREFIX = 'acc-'

// Removing an account deletes its Partitions/acc-<id> folder, but Electron keeps that session in
// memory and Chromium may write an empty shell of the folder back before quitting. Those are swept
// at the next startup. Only exact acc-<uuid> names qualify: acc-<id>.partial import leftovers
// belong to sweepPartials, and anything else in the folder is not ours to judge.
export function orphanPartitions(names: readonly string[], accountIds: Iterable<string>): string[] {
  const known = new Set(accountIds)
  return names.filter((n) => {
    if (!n.startsWith(PREFIX)) return false
    const id = n.slice(PREFIX.length)
    return AccountId.safeParse(id).success && !known.has(id)
  })
}

// Only an account list read from diwan.json itself is trusted to say what is an orphan. Recovery
// mode has no list at all, a .bak may predate the newest accounts, and a missing file says nothing.
export function orphanSweepAllowed(store: { recovery: boolean; source: LoadSource }): boolean {
  return !store.recovery && store.source === 'file'
}

// Deletes orphan account folders. Only plain directories are removed (lstat: a symlink is never
// followed). Returns the names it removed; a folder that can't be read or removed is skipped.
export async function sweepOrphanPartitions(
  partitionsDir: string,
  accountIds: Iterable<string>,
): Promise<string[]> {
  let names: string[]
  try {
    names = await readdir(partitionsDir)
  } catch {
    return []
  }
  const removed: string[] = []
  for (const n of orphanPartitions(names, accountIds)) {
    const dir = join(partitionsDir, n)
    const isPlainDir = await lstat(dir).then(
      (st) => st.isDirectory(),
      () => false,
    )
    if (!isPlainDir) continue
    try {
      await rm(dir, { recursive: true, force: true })
      removed.push(n)
    } catch {}
  }
  return removed
}
