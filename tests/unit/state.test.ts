import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { StateHub } from '../../src/main/state'
import { Store } from '../../src/main/store/store'
import type { Snapshot } from '../../src/shared/types'

const hub = () => new StateHub(new Store(mkdtempSync(join(tmpdir(), 'diwan-hub-')), 0))
const nextSnapshot = (h: StateHub) => new Promise<Snapshot>((r) => h.once('changed', r))

describe('StateHub', () => {
  test('first account becomes active; snapshot has default runtime', () => {
    const h = hub()
    const a = h.addAccount('Personal', '#3b82f6')
    const s = h.snapshot()
    expect(s.activeId).toBe(a.id)
    expect(s.runtime[a.id]).toEqual({ state: 'loading', unread: 0, avatar: null })
  })

  test('changes are batched into one event per tick', async () => {
    const h = hub()
    let events = 0
    h.on('changed', () => events++)
    h.addAccount('A', '#3b82f6')
    h.addAccount('B', '#14b8a6')
    await new Promise((r) => setTimeout(r, 0))
    expect(events).toBe(1)
  })

  test('remove re-indexes and moves the active account', async () => {
    const h = hub()
    const a = h.addAccount('A', '#3b82f6')
    const b = h.addAccount('B', '#14b8a6')
    h.removeAccount(a.id)
    const s = await nextSnapshot(h)
    expect(s.accounts.map((x) => [x.name, x.order])).toEqual([['B', 0]])
    expect(s.activeId).toBe(b.id)
  })

  test('reorder ignores unknown ids and keeps the rest', () => {
    const h = hub()
    const a = h.addAccount('A', '#3b82f6')
    const b = h.addAccount('B', '#14b8a6')
    const c = h.addAccount('C', '#f59e0b')
    h.reorder([c.id, '00000000-0000-0000-0000-000000000000', a.id])
    expect(h.accounts().map((x) => x.name)).toEqual(['C', 'A', 'B'])
    expect(b.id).toBeTruthy()
  })

  test('cycle wraps around', () => {
    const h = hub()
    const a = h.addAccount('A', '#3b82f6')
    const b = h.addAccount('B', '#14b8a6')
    expect(h.cycle(1)).toBe(b.id)
    expect(h.cycle(1)).toBe(a.id)
    expect(h.cycle(-1)).toBe(b.id)
  })

  test('setRuntime only emits on a real change', async () => {
    const h = hub()
    const a = h.addAccount('A', '#3b82f6')
    await nextSnapshot(h)
    let events = 0
    h.on('changed', () => events++)
    h.setRuntime(a.id, { unread: 0 })
    await new Promise((r) => setTimeout(r, 0))
    expect(events).toBe(0)
    h.setRuntime(a.id, { unread: 3 })
    await new Promise((r) => setTimeout(r, 0))
    expect(events).toBe(1)
  })

  test('settings patch merges nested notifications', () => {
    const h = hub()
    h.updateSettings({ notifications: { sound: false } })
    expect(h.settings().notifications).toMatchObject({ sound: false, enabled: true })
  })

  test('recovery mode: adding throws, other changes are ignored', () => {
    const dir = mkdtempSync(join(tmpdir(), 'diwan-hub-'))
    writeFileSync(join(dir, 'diwan.json'), 'broken')
    const h = new StateHub(new Store(dir, 0))
    expect(h.snapshot().recovery).toBe(true)
    expect(() => h.addAccount('A', '#3b82f6')).toThrow()
    expect(() => h.updateSettings({ closeToTray: false })).not.toThrow()
  })

  const tick = () => new Promise((r) => setTimeout(r, 0))
  const counter = (h: StateHub) => {
    const c = { n: 0 }
    h.on('changed', () => c.n++)
    return c
  }
  const recoveryHub = () => {
    const dir = mkdtempSync(join(tmpdir(), 'diwan-hub-'))
    writeFileSync(join(dir, 'diwan.json'), 'broken')
    return new StateHub(new Store(dir, 0))
  }

  test('setRuntime on a removed id does nothing', async () => {
    const h = hub()
    const a = h.addAccount('A', '#3b82f6')
    h.removeAccount(a.id)
    await tick()
    const c = counter(h)
    h.setRuntime(a.id, { unread: 5 })
    await tick()
    expect(c.n).toBe(0)
    expect(h.snapshot().runtime[a.id]).toBeUndefined()
    expect(h.runtimeOf(a.id).unread).toBe(0)
  })

  test('runtimeOf defaults are frozen and do not leak between ids', () => {
    const h = hub()
    const a = h.addAccount('A', '#3b82f6')
    const b = h.addAccount('B', '#14b8a6')
    expect(() => {
      ;(h.runtimeOf(a.id) as { unread: number }).unread = 9
    }).toThrow()
    expect(h.runtimeOf(b.id).unread).toBe(0)
  })

  test('setActive(unknown) is false; cycle with 0 and 1 accounts', async () => {
    const h = hub()
    expect(h.setActive('00000000-0000-0000-0000-000000000000')).toBe(false)
    expect(h.cycle(1)).toBeNull()
    const a = h.addAccount('A', '#3b82f6')
    await tick()
    const c = counter(h)
    expect(h.cycle(1)).toBe(a.id)
    await tick()
    expect(c.n).toBe(0)
  })

  test('remove cleans up runtime', () => {
    const h = hub()
    const a = h.addAccount('A', '#3b82f6')
    h.setRuntime(a.id, { unread: 4 })
    h.removeAccount(a.id)
    expect(h.runtimeOf(a.id).unread).toBe(0)
    expect(h.snapshot().activeId).toBeNull()
  })

  test('persistWindow does not emit', async () => {
    const h = hub()
    await tick()
    const c = counter(h)
    h.persistWindow({ bounds: null, maximized: true })
    await tick()
    expect(c.n).toBe(0)
  })

  test('recovery: remove, markImported, reorder, update do not emit', async () => {
    const h = recoveryHub()
    h.importAvailable = true
    await tick()
    const c = counter(h)
    const id = '00000000-0000-0000-0000-000000000001'
    h.removeAccount(id)
    h.markImported()
    h.reorder([id])
    h.updateAccount(id, { name: 'x' })
    h.updateSettings({ closeToTray: false })
    await tick()
    expect(c.n).toBe(0)
    expect(h.importAvailable).toBe(true)
  })

  test('unknown-id remove/update and unchanged reorder do not emit', async () => {
    const h = hub()
    const a = h.addAccount('A', '#3b82f6')
    const b = h.addAccount('B', '#14b8a6')
    await tick()
    const c = counter(h)
    const ghost = '00000000-0000-0000-0000-000000000009'
    h.removeAccount(ghost)
    h.updateAccount(ghost, { name: 'x' })
    h.updateAccount(a.id, { name: 'A', muted: false })
    h.reorder([a.id, b.id])
    await tick()
    expect(c.n).toBe(0)
    h.updateAccount(a.id, { name: 'A2' })
    await tick()
    expect(c.n).toBe(1)
  })

  test('a throwing listener goes to onListenerError; later emits still happen', async () => {
    const errors: unknown[] = []
    const h = new StateHub(new Store(mkdtempSync(join(tmpdir(), 'diwan-hub-')), 0), (e) => errors.push(e))
    let calls = 0
    h.on('changed', () => {
      calls++
      throw new Error('boom')
    })
    const a = h.addAccount('A', '#3b82f6')
    await tick()
    h.setRuntime(a.id, { unread: 1 })
    await tick()
    expect(errors).toHaveLength(2)
    expect(calls).toBe(2)
  })

  test('a failing write still adds the account, emits and reports', async () => {
    const errors: unknown[] = []
    const dir = mkdtempSync(join(tmpdir(), 'diwan-hub-'))
    const store = new Store(dir, 300, (e) => errors.push(e), {
      writeFileSync: () => {
        throw new Error('disk full')
      },
    })
    const h = new StateHub(store)
    const c = counter(h)
    const a = h.addAccount('A', '#3b82f6')
    await tick()
    expect(h.accounts().map((x) => x.id)).toEqual([a.id])
    expect(c.n).toBe(1)
    expect(errors.length).toBeGreaterThan(0)
  })

  describe('folder removals (tombstones)', () => {
    test('removing an account tombstones its id in the same store update, and persists it', () => {
      const dir = mkdtempSync(join(tmpdir(), 'diwan-hub-'))
      const h = new StateHub(new Store(dir, 0))
      const a = h.addAccount('A', '#3b82f6')
      const b = h.addAccount('B', '#14b8a6')
      const update = h.store.update.bind(h.store)
      const files: { accounts: string[]; pending: string[] }[] = []
      h.store.update = (fn) => {
        update(fn)
        const f = h.store.get()
        files.push({ accounts: f.accounts.map((x) => x.id), pending: [...f.pendingFolderRemovals] })
      }
      h.removeAccount(a.id)
      expect(files).toEqual([{ accounts: [b.id], pending: [a.id] }])
      expect(new Store(dir, 0).get().pendingFolderRemovals).toEqual([a.id])
    })

    test('a removal in recovery mode tombstones nothing', () => {
      const h = recoveryHub()
      h.removeAccount('649d14d5-ebb9-4ed6-9725-633b89c6ceac')
      expect(h.pendingFolderRemovals()).toEqual([])
    })

    test('clearFolderRemovals drops only the given ids, and persists', () => {
      const dir = mkdtempSync(join(tmpdir(), 'diwan-hub-'))
      const h = new StateHub(new Store(dir, 0))
      const a = h.addAccount('A', '#3b82f6')
      const b = h.addAccount('B', '#14b8a6')
      h.removeAccount(a.id)
      h.removeAccount(b.id)
      h.clearFolderRemovals([a.id])
      expect(h.pendingFolderRemovals()).toEqual([b.id])
      expect(new Store(dir, 0).get().pendingFolderRemovals).toEqual([b.id])
      h.clearFolderRemovals([])
      expect(h.pendingFolderRemovals()).toEqual([b.id])
    })

    test('re-adding a tombstoned id (re-import) clears its tombstone', () => {
      const h = hub()
      const a = h.addAccount('A', '#3b82f6')
      h.removeAccount(a.id)
      h.addAccount('A again', '#3b82f6', a.id)
      expect(h.pendingFolderRemovals()).toEqual([])
    })
  })
})
