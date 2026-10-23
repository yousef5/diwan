import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { SNAPSHOT_GAP_MS, StateHub } from '../../src/main/state'
import { Store } from '../../src/main/store/store'
import type { Snapshot } from '../../src/shared/types'

// gap 0: these tests are about what emits, not how often (the throttle has its own tests below)
const hub = () => new StateHub(new Store(mkdtempSync(join(tmpdir(), 'diwan-hub-')), 0), undefined, 0)
const nextSnapshot = (h: StateHub) => new Promise<Snapshot>((r) => h.once('changed', r))

describe('StateHub', () => {
  test('snapshot carries the platform and the data folder', () => {
    const root = mkdtempSync(join(tmpdir(), 'diwan-hub-'))
    const h = new StateHub(new Store(root, 0), undefined, 0)
    const s = h.snapshot()
    expect(s.platform).toBe(
      process.platform === 'win32' || process.platform === 'darwin' ? process.platform : 'linux',
    )
    expect(s.dataDir).toBe(root)
    h.dataDir = '/elsewhere'
    h.platform = 'win32'
    expect(h.snapshot()).toMatchObject({ dataDir: '/elsewhere', platform: 'win32' })
  })

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
    const h = new StateHub(new Store(mkdtempSync(join(tmpdir(), 'diwan-hub-')), 0), (e) => errors.push(e), 0)
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

describe('StateHub snapshot throttle', () => {
  afterEach(() => vi.useRealTimers())
  const throttled = () => {
    const dir = mkdtempSync(join(tmpdir(), 'diwan-hub-'))
    return { dir, h: new StateHub(new Store(dir, 0)) }
  }
  const flushMicrotasks = () => vi.advanceTimersByTimeAsync(0)

  test('after a quiet spell the push goes out in the same tick', async () => {
    vi.useFakeTimers()
    const { h } = throttled()
    const seen: number[] = []
    h.on('changed', () => seen.push(Date.now()))
    const start = Date.now()
    h.addAccount('A', '#3b82f6')
    await flushMicrotasks()
    expect(seen).toEqual([start])
  })

  test('a flood is coalesced to one push per gap, and the last state always goes out', async () => {
    vi.useFakeTimers()
    const { h } = throttled()
    const a = h.addAccount('A', '#3b82f6')
    await flushMicrotasks()
    const pushes: { at: number; unread: number }[] = []
    h.on('changed', (s) => pushes.push({ at: Date.now(), unread: s.runtime[a.id]?.unread ?? -1 }))
    // 1000 title changes, one per ms, each in its own macrotask
    for (let i = 1; i <= 1000; i++) {
      h.setRuntime(a.id, { unread: i })
      await vi.advanceTimersByTimeAsync(1)
    }
    await vi.advanceTimersByTimeAsync(SNAPSHOT_GAP_MS)
    expect(pushes.length).toBeLessThanOrEqual(1000 / SNAPSHOT_GAP_MS + 1)
    expect(pushes.length).toBeGreaterThanOrEqual(1000 / SNAPSHOT_GAP_MS - 1)
    for (let i = 1; i < pushes.length; i++)
      expect((pushes[i]?.at ?? 0) - (pushes[i - 1]?.at ?? 0)).toBeGreaterThanOrEqual(SNAPSHOT_GAP_MS)
    expect(pushes.at(-1)?.unread).toBe(1000)
    // and nothing is left pending
    await vi.advanceTimersByTimeAsync(10 * SNAPSHOT_GAP_MS)
    expect(pushes.at(-1)?.unread).toBe(1000)
  })

  test('a change inside the gap is delivered at its end with the latest state', async () => {
    vi.useFakeTimers()
    const { h } = throttled()
    const a = h.addAccount('A', '#3b82f6')
    await flushMicrotasks()
    const got: number[] = []
    h.on('changed', (s) => got.push(s.runtime[a.id]?.unread ?? -1))
    await vi.advanceTimersByTimeAsync(10)
    h.setRuntime(a.id, { unread: 1 })
    h.setRuntime(a.id, { unread: 2 })
    await vi.advanceTimersByTimeAsync(SNAPSHOT_GAP_MS - 11)
    expect(got).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    expect(got).toEqual([2])
  })

  test('persistence is not throttled: account changes hit the disk at once', async () => {
    vi.useFakeTimers()
    const { dir, h } = throttled()
    h.addAccount('A', '#3b82f6')
    await flushMicrotasks()
    h.addAccount('B', '#14b8a6') // inside the gap: the push waits, the write does not
    const onDisk = JSON.parse(readFileSync(join(dir, 'diwan.json'), 'utf8')) as {
      accounts: { name: string }[]
    }
    expect(onDisk.accounts.map((x) => x.name)).toEqual(['A', 'B'])
  })
})

describe('StateHub push contract', () => {
  afterEach(() => vi.useRealTimers())
  const throttled = (onListenerError?: (e: unknown) => void) =>
    new StateHub(new Store(mkdtempSync(join(tmpdir(), 'diwan-hub-')), 0), onListenerError, SNAPSHOT_GAP_MS)
  const flushMicrotasks = () => vi.advanceTimersByTimeAsync(0)
  // A hub that has just pushed, so the next runtime change falls inside the gap.
  const justPushed = async () => {
    const h = throttled()
    const a = h.addAccount('A', '#3b82f6')
    await flushMicrotasks()
    const got: Snapshot[] = []
    h.on('changed', (s) => got.push(s))
    return { h, a, got }
  }

  test('a backward wall-clock step does not freeze runtime pushes', async () => {
    vi.useFakeTimers()
    const { h, a, got } = await justPushed()
    vi.setSystemTime(Date.now() - 3_600_000)
    h.setRuntime(a.id, { unread: 1 })
    await vi.advanceTimersByTimeAsync(SNAPSHOT_GAP_MS)
    expect(got.map((s) => s.runtime[a.id]?.unread)).toEqual([1])
  })

  test('a forward wall-clock step does not make a runtime push wait', async () => {
    vi.useFakeTimers()
    const { h, a, got } = await justPushed()
    vi.setSystemTime(Date.now() + 3_600_000)
    h.setRuntime(a.id, { unread: 1 })
    await vi.advanceTimersByTimeAsync(SNAPSHOT_GAP_MS)
    expect(got).toHaveLength(1)
  })

  test('account, settings and active changes push at the end of the tick, even inside the gap', async () => {
    vi.useFakeTimers()
    const { h, a, got } = await justPushed()
    h.updateAccount(a.id, { name: 'Renamed' })
    await flushMicrotasks()
    expect(got.map((s) => s.accounts[0]?.name)).toEqual(['Renamed'])

    h.updateSettings({ closeToTray: false })
    await flushMicrotasks()
    expect(got.at(-1)?.settings.closeToTray).toBe(false)

    const b = h.addAccount('B', '#14b8a6')
    await flushMicrotasks()
    h.setActive(b.id)
    await flushMicrotasks()
    expect(got.at(-1)?.activeId).toBe(b.id)
    expect(got).toHaveLength(4)
  })

  test('notify() pushes at the end of the tick, even inside the gap', async () => {
    vi.useFakeTimers()
    const { h, got } = await justPushed()
    h.importAvailable = true
    h.notify()
    await flushMicrotasks()
    expect(got.map((s) => s.importAvailable)).toEqual([true])
  })

  test('a mutation folds a waiting runtime push into its own, in order, with nothing left over', async () => {
    vi.useFakeTimers()
    const { h, a, got } = await justPushed()
    h.setRuntime(a.id, { unread: 3 }) // inside the gap: waits
    h.updateAccount(a.id, { muted: true })
    await flushMicrotasks()
    expect(got).toHaveLength(1)
    expect(got[0]?.runtime[a.id]?.unread).toBe(3)
    expect(got[0]?.accounts[0]?.muted).toBe(true)
    await vi.advanceTimersByTimeAsync(10 * SNAPSHOT_GAP_MS)
    expect(got).toHaveLength(1)
  })

  test('the push for a handler’s change goes out before ipcMain.handle replies', async () => {
    const h = throttled()
    const order: string[] = []
    h.on('changed', (s) => order.push(`push:${s.accounts.length}`))
    // What Electron does with a handle()d channel, wrapped in an async guard like ipc-guard's.
    const guard = async () => await h.addAccount('A', '#3b82f6')
    const reply = async () => order.push(`reply:${(await Promise.resolve(guard())).name}`)
    await reply()
    expect(order).toEqual(['push:1', 'reply:A'])
  })

  test('flush() sends a waiting runtime push synchronously and only once', async () => {
    vi.useFakeTimers()
    const { h, a, got } = await justPushed()
    h.setRuntime(a.id, { state: 'loggingOut' })
    h.setRuntime(a.id, { state: 'loading' })
    h.flush() // what sendShell does before a remount
    expect(got.map((s) => s.runtime[a.id]?.state)).toEqual(['loading'])
    await vi.advanceTimersByTimeAsync(10 * SNAPSHOT_GAP_MS)
    expect(got).toHaveLength(1)
    h.flush()
    expect(got).toHaveLength(1)
  })

  test('flush() with a queued end-of-tick push sends it once', async () => {
    vi.useFakeTimers()
    const { h, a, got } = await justPushed()
    h.updateAccount(a.id, { name: 'X' })
    h.flush()
    expect(got).toHaveLength(1)
    await flushMicrotasks()
    expect(got).toHaveLength(1)
  })

  test('a stale end-of-tick push does not fire once flush() has sent it (seq guard)', async () => {
    vi.useFakeTimers()
    const { h, a, got } = await justPushed()
    await vi.advanceTimersByTimeAsync(SNAPSHOT_GAP_MS) // out of the first gap
    h.updateAccount(a.id, { name: 'Renamed' }) // queues an end-of-tick push
    h.flush() // ...which goes out now, so the queued microtask is stale
    h.setRuntime(a.id, { unread: 1 }) // inside the new gap: must wait for its end
    await vi.advanceTimersByTimeAsync(0)
    expect(got.map((s) => s.runtime[a.id]?.unread)).toEqual([0])
    await vi.advanceTimersByTimeAsync(SNAPSHOT_GAP_MS)
    expect(got.map((s) => s.runtime[a.id]?.unread)).toEqual([0, 1])
    expect(got[0]?.accounts[0]?.name).toBe('Renamed')
  })

  test('a listener that changes state and flushes cannot deliver snapshots out of order', async () => {
    vi.useFakeTimers()
    const h = throttled()
    const a = h.addAccount('A', '#3b82f6')
    await flushMicrotasks()
    const seen: string[] = []
    let once = true
    // The first listener reacts to a push by renaming and flushing (as sendShell would).
    h.on('changed', () => {
      if (!once) return
      once = false
      h.updateAccount(a.id, { name: 'B' })
      h.flush()
    })
    h.on('changed', (s) => seen.push(s.accounts[0]?.name ?? '?'))
    h.updateAccount(a.id, { muted: true })
    await flushMicrotasks()
    expect(seen).toEqual(['A', 'B'])
    await vi.advanceTimersByTimeAsync(10 * SNAPSHOT_GAP_MS)
    expect(seen).toEqual(['A', 'B'])
  })

  test('a throwing listener keeps the chain going (gap 50)', async () => {
    vi.useFakeTimers()
    const errors: unknown[] = []
    const h = throttled((e) => errors.push(e))
    let calls = 0
    h.on('changed', () => {
      calls++
      throw new Error('boom')
    })
    const a = h.addAccount('A', '#3b82f6')
    await flushMicrotasks()
    h.setRuntime(a.id, { unread: 1 }) // inside the gap: a timer push
    await vi.advanceTimersByTimeAsync(SNAPSHOT_GAP_MS)
    h.setRuntime(a.id, { unread: 2 }) // and the next one still goes out
    await vi.advanceTimersByTimeAsync(SNAPSHOT_GAP_MS)
    h.updateAccount(a.id, { muted: true })
    await flushMicrotasks()
    expect(calls).toBe(4)
    expect(errors).toHaveLength(4)
  })
})
