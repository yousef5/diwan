import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  orphanSweepAllowed,
  planFolderRemovals,
  sweepRemovedAccountFolders,
} from '../../src/main/orphan-partitions'
import { StateHub } from '../../src/main/state'
import { Store } from '../../src/main/store/store'

const A = '0f3c2b1a-1111-4222-8333-944455556666'
const B = '7d8e9f00-aaaa-4bbb-8ccc-ddddeeeeffff'
const GONE = '12345678-9abc-4def-8123-456789abcdef'

const account = (id: string, name: string, order: number) => ({ id, name, color: '#3b82f6', order })
const file = (accounts: ReturnType<typeof account>[], pendingFolderRemovals: string[] = []) =>
  JSON.stringify({ schemaVersion: 1, accounts, pendingFolderRemovals })

describe('planFolderRemovals', () => {
  test('removes only tombstoned ids that are not accounts', () => {
    expect(planFolderRemovals([GONE], [A, B])).toEqual({ remove: [GONE], settle: [] })
  })

  test('never removes anything without a tombstone, however orphaned it looks', () => {
    expect(planFolderRemovals([], [])).toEqual({ remove: [], settle: [] })
  })

  test('a tombstoned id that is an account again is kept, and its tombstone settled', () => {
    expect(planFolderRemovals([A, GONE], [A])).toEqual({ remove: [GONE], settle: [A] })
  })

  test('an entry that is not an exact lowercase uuid is never turned into a path', () => {
    const bad = ['', '..', `${GONE}/..`, `../${GONE}`, GONE.toUpperCase(), `${GONE}.partial`, `${GONE}\n`]
    expect(planFolderRemovals(bad, [])).toEqual({ remove: [], settle: bad })
  })
})

describe('orphanSweepAllowed', () => {
  test('only when the account list came from the settings file itself', () => {
    expect(orphanSweepAllowed({ recovery: false, source: 'file' })).toBe(true)
    expect(orphanSweepAllowed({ recovery: true, source: 'default' })).toBe(false) // damaged file
    expect(orphanSweepAllowed({ recovery: false, source: 'backup' })).toBe(false)
    expect(orphanSweepAllowed({ recovery: false, source: 'default' })).toBe(false) // no file at all
  })
})

describe('sweepRemovedAccountFolders', () => {
  const dirs: string[] = []
  const tmp = () => {
    const d = mkdtempSync(join(tmpdir(), 'diwan-sweep-'))
    dirs.push(d)
    return d
  }
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
  })

  // A profile: <root>/diwan.json (+ .bak) and <root>/Partitions/acc-<id>/… for each folder id.
  function profile(opts: { main?: string; bak?: string; folders: string[] }) {
    const root = tmp()
    const parts = join(root, 'Partitions')
    mkdirSync(parts)
    for (const id of opts.folders) mkdirSync(join(parts, `acc-${id}`, 'Local Storage'), { recursive: true })
    if (opts.main !== undefined) writeFileSync(join(root, 'diwan.json'), opts.main)
    if (opts.bak !== undefined) writeFileSync(join(root, 'diwan.json.bak'), opts.bak)
    const launch = () => new StateHub(new Store(root, 0))
    const has = (id: string) => existsSync(join(parts, `acc-${id}`))
    return { root, parts, launch, has }
  }

  test('a folder for an account missing from the list, with no tombstone, is KEPT', async () => {
    const p = profile({ main: file([account(A, 'A', 0)]), folders: [A, B] })
    await expect(sweepRemovedAccountFolders(p.parts, p.launch())).resolves.toEqual([])
    expect(p.has(A)).toBe(true)
    expect(p.has(B)).toBe(true)
  })

  test('a removed account’s folder that came back is deleted on the next launch, then settled', async () => {
    const p = profile({ main: file([account(A, 'A', 0), account(B, 'B', 1)]), folders: [A, B] })
    p.launch().removeAccount(B) // run 1: Chromium writes acc-<B> back after the removal
    const hub = p.launch() // run 2
    expect(hub.pendingFolderRemovals()).toEqual([B])
    await expect(sweepRemovedAccountFolders(p.parts, hub)).resolves.toEqual([`acc-${B}`])
    expect(p.has(B)).toBe(false)
    expect(p.has(A)).toBe(true)
    expect(p.launch().pendingFolderRemovals()).toEqual([])
  })

  test('a tombstoned id that was re-added as an account is not deleted, and its tombstone is cleared', async () => {
    const p = profile({ main: file([account(A, 'A', 0)], [A]), folders: [A] })
    const hub = p.launch()
    await expect(sweepRemovedAccountFolders(p.parts, hub)).resolves.toEqual([])
    expect(p.has(A)).toBe(true)
    expect(p.launch().pendingFolderRemovals()).toEqual([])
  })

  test('a tombstone whose folder is already gone is settled', async () => {
    const p = profile({ main: file([], [GONE]), folders: [] })
    await sweepRemovedAccountFolders(p.parts, p.launch())
    expect(p.launch().pendingFolderRemovals()).toEqual([])
  })

  test('never follows a symlink or touches a plain file, even when tombstoned', async () => {
    const p = profile({ main: file([], [GONE, B]), folders: [] })
    const elsewhere = tmp()
    writeFileSync(join(elsewhere, 'precious'), 'x')
    symlinkSync(elsewhere, join(p.parts, `acc-${GONE}`))
    writeFileSync(join(p.parts, `acc-${B}`), 'not a folder')
    await expect(sweepRemovedAccountFolders(p.parts, p.launch())).resolves.toEqual([])
    expect(existsSync(join(elsewhere, 'precious'))).toBe(true)
    expect(p.has(GONE)).toBe(true)
    expect(p.has(B)).toBe(true)
  })

  test('a failed delete keeps its tombstone for the next launch', async () => {
    const p = profile({ main: file([], [GONE, B]), folders: [GONE, B] })
    const rm = vi.fn(async (path: string) => {
      if (path.endsWith(GONE)) throw new Error('EBUSY')
      rmSync(path, { recursive: true, force: true })
    })
    await expect(sweepRemovedAccountFolders(p.parts, p.launch(), { rm })).resolves.toEqual([`acc-${B}`])
    expect(p.has(GONE)).toBe(true)
    expect(p.launch().pendingFolderRemovals()).toEqual([GONE])
  })

  test('win32 deletes retry through file locks; linux passes no retry options', async () => {
    for (const [platform, extra] of [
      ['win32', { maxRetries: 5, retryDelay: 200 }],
      ['linux', {}],
    ] as const) {
      const p = profile({ main: file([], [GONE]), folders: [GONE] })
      const rm = vi.fn(async (path: string) => rmSync(path, { recursive: true, force: true }))
      await sweepRemovedAccountFolders(p.parts, p.launch(), { rm, platform })
      expect(rm).toHaveBeenCalledWith(join(p.parts, `acc-${GONE}`), {
        recursive: true,
        force: true,
        ...extra,
      })
    }
  })

  test('runs nothing in recovery mode', async () => {
    const p = profile({ main: 'broken', bak: file([], [GONE]), folders: [GONE] })
    writeFileSync(join(p.root, 'diwan.json.bak'), 'also broken')
    const hub = p.launch()
    expect(hub.store.recovery).toBe(true)
    await expect(sweepRemovedAccountFolders(p.parts, hub)).resolves.toEqual([])
    expect(p.has(GONE)).toBe(true)
  })

  test('Start fresh, then relaunch, deletes nothing', async () => {
    const p = profile({ main: 'broken', folders: [A, B] })
    const recovering = p.launch()
    expect(recovering.store.recovery).toBe(true)
    recovering.store.startFresh()
    const hub = p.launch()
    expect(hub.store.source).toBe('file')
    await expect(sweepRemovedAccountFolders(p.parts, hub)).resolves.toEqual([])
    expect(p.has(A)).toBe(true)
    expect(p.has(B)).toBe(true)
  })

  test('reviewer’s case: loaded from .bak, saved, relaunched: acc-<B> survives', async () => {
    const p = profile({
      main: 'damaged',
      bak: file([account(A, 'A', 0)]),
      folders: [A, B],
    })
    const run1 = p.launch()
    expect(run1.store.source).toBe('backup')
    await expect(sweepRemovedAccountFolders(p.parts, run1)).resolves.toEqual([])
    run1.updateAccount(A, { muted: true }) // writes a valid diwan.json without B
    const run2 = p.launch()
    expect(run2.store.source).toBe('file')
    await expect(sweepRemovedAccountFolders(p.parts, run2)).resolves.toEqual([])
    expect(p.has(B)).toBe(true)
    expect(p.has(A)).toBe(true)
  })

  test('a missing Partitions folder is not an error', async () => {
    const p = profile({ main: file([], [GONE]), folders: [] })
    rmSync(p.parts, { recursive: true })
    await expect(sweepRemovedAccountFolders(p.parts, p.launch())).resolves.toEqual([])
  })
})
