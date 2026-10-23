import { rm as fsRm, lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { AccountId } from '../shared/validators'
import { rmRetryOptions } from './retry-fs'
import type { LoadSource } from './store/store'

// Removing an account deletes its Partitions/acc-<id> folder, but Electron keeps that session in
// memory and Chromium may write an empty shell of the folder back before quitting. So the removal
// also leaves a tombstone (pendingFolderRemovals, written in the same store update), and the next
// start deletes the folder again. A folder is NEVER deleted just because no account lists it: an
// account list loaded from .bak, or rebuilt by "Start fresh", can miss accounts that still exist.

type RmOptions = { recursive: true; force: true; maxRetries?: number; retryDelay?: number }

export interface FolderRemovalPlan {
  remove: string[] // ids whose acc-<id> folder may be deleted
  settle: string[] // tombstones to drop without touching anything
}

// Pure decision: delete only tombstoned ids that are not accounts now. A tombstoned id that is an
// account again (re-import) owns its folder; an entry that isn't an exact uuid never becomes a path.
export function planFolderRemovals(
  pending: readonly string[],
  accountIds: Iterable<string>,
): FolderRemovalPlan {
  const known = new Set(accountIds)
  const plan: FolderRemovalPlan = { remove: [], settle: [] }
  for (const id of new Set(pending)) {
    if (AccountId.safeParse(id).success && !known.has(id)) plan.remove.push(id)
    else plan.settle.push(id)
  }
  return plan
}

// Whether removing an account deletes its folder right away. Not on Windows: Chromium keeps the
// removed session's files open until quit, so the delete would fail or half-finish; the tombstone
// sweep at the next start deletes it instead (its storage is already cleared by then).
export function deleteFolderOnRemoval(platform: NodeJS.Platform = process.platform): boolean {
  return platform !== 'win32'
}

// Only an account list read from diwan.json itself is trusted at all. Recovery mode has no list,
// a .bak may predate the newest accounts, and a missing file says nothing.
export function orphanSweepAllowed(store: { recovery: boolean; source: LoadSource }): boolean {
  return !store.recovery && store.source === 'file'
}

export interface FolderSweepHub {
  readonly store: { recovery: boolean; source: LoadSource }
  accounts(): readonly { id: string }[]
  pendingFolderRemovals(): readonly string[]
  clearFolderRemovals(ids: readonly string[]): void
}

// Deletes the folders of tombstoned accounts. Only plain directories are removed (lstat: a symlink
// is never followed); a tombstone whose path is missing, a symlink or a file is settled untouched.
// A failed delete keeps its tombstone for the next start. Returns the folder names it removed.
export async function sweepRemovedAccountFolders(
  partitionsDir: string,
  hub: FolderSweepHub,
  deps: {
    rm?: (path: string, opts: RmOptions) => Promise<void>
    platform?: NodeJS.Platform
  } = {},
): Promise<string[]> {
  if (!orphanSweepAllowed(hub.store)) return []
  const rm = deps.rm ?? fsRm
  const plan = planFolderRemovals(
    hub.pendingFolderRemovals(),
    hub.accounts().map((a) => a.id),
  )
  const settled = [...plan.settle]
  const removed: string[] = []
  for (const id of plan.remove) {
    const name = `acc-${id}`
    const dir = join(partitionsDir, name)
    let isPlainDir: boolean
    try {
      isPlainDir = (await lstat(dir)).isDirectory()
    } catch (e) {
      // Gone already: nothing left to do. Any other error: try again next start.
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') settled.push(id)
      continue
    }
    if (!isPlainDir) {
      settled.push(id)
      continue
    }
    try {
      await rm(dir, { recursive: true, force: true, ...rmRetryOptions(deps.platform) })
      removed.push(name)
      settled.push(id)
    } catch {}
  }
  hub.clearFolderRemovals(settled)
  return removed
}
