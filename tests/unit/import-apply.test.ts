import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  applyImport,
  dirSize,
  fsPlanDeps,
  MAX_TEXT_BYTES,
  nexusRunning,
  readSmallText,
  sweepPartials,
} from '../../src/main/importer/apply'
import { planImport } from '../../src/main/importer/plan'
import { createLogger } from '../../src/main/log'
import { StateHub } from '../../src/main/state'
import { Store } from '../../src/main/store/store'

const ID_A = '649d14d5-ebb9-4ed6-9725-633b89c6ceac'
const ID_B = 'b2c1d4e5-0000-4000-8000-000000000002'

const temps: string[] = []
const tmp = (prefix: string) => {
  const d = mkdtempSync(join(tmpdir(), prefix))
  temps.push(d)
  return d
}
afterEach(() => {
  for (const d of temps.splice(0)) {
    try {
      chmodSync(d, 0o700)
    } catch {}
    rmSync(d, { recursive: true, force: true })
  }
})

const quiet = (dir: string) => createLogger(dir, { echo: false })
const mkHub = () => {
  const diwanDir = tmp('diwan-')
  return { diwanDir, hub: new StateHub(new Store(diwanDir, 0)), parts: join(diwanDir, 'Partitions') }
}
const item = (sourceId: string, sourceDir: string, name = sourceId) => ({
  sourceId,
  name,
  color: '#3b82f6',
  sourceDir,
  bytes: 0,
})
const plan = (...items: ReturnType<typeof item>[]) => ({
  available: true,
  reason: null,
  orphanDirs: 0,
  nexusRunning: false,
  items,
})

function fakeNexus() {
  const root = tmp('nexus-')
  const parts = join(root, 'MultiWhatsApp', 'Partitions')
  mkdirSync(join(parts, `wa-${ID_A}`, 'IndexedDB'), { recursive: true })
  writeFileSync(join(parts, `wa-${ID_A}`, 'IndexedDB', 'db.ldb'), 'session-bytes')
  mkdirSync(join(parts, 'wa-orphan'), { recursive: true })
  const cfg = join(root, 'config.json')
  writeFileSync(cfg, JSON.stringify({ accounts: [{ id: ID_A, name: 'Account 1', order: 0 }] }))
  return { root, parts, cfg, userData: join(root, 'MultiWhatsApp') }
}

describe('import apply', () => {
  test('win32: a rename blocked by a transient file lock is retried', async () => {
    const n = fakeNexus()
    const { hub, parts, diwanDir } = mkHub()
    let calls = 0
    const rename = vi.fn(async (from: string, to: string) => {
      if (calls++ === 0) throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' })
      renameSync(from, to)
    })
    const r = await applyImport(plan(item(ID_A, join(n.parts, `wa-${ID_A}`), 'A')), {
      hub,
      partitionsDir: parts,
      setupSession: () => {},
      log: quiet(diwanDir),
      rename,
      retry: { platform: 'win32', delays: [0, 0] },
    })
    expect(r).toEqual({ imported: ['A'], failed: [] })
    expect(rename).toHaveBeenCalledTimes(2)
  })

  test('linux: a failed rename is not retried', async () => {
    const n = fakeNexus()
    const { hub, parts, diwanDir } = mkHub()
    const rename = vi.fn(async () => {
      throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' })
    })
    const r = await applyImport(plan(item(ID_A, join(n.parts, `wa-${ID_A}`), 'A')), {
      hub,
      partitionsDir: parts,
      setupSession: () => {},
      log: quiet(diwanDir),
      rename,
      retry: { platform: 'linux', delays: [0, 0] },
    })
    expect(r.failed).toHaveLength(1)
    expect(rename).toHaveBeenCalledTimes(1)
    expect(hub.accounts()).toEqual([])
  })

  test('copies the session, registers the account, leaves Nexus untouched', async () => {
    const n = fakeNexus()
    const diwanDir = tmp('diwan-')
    const hub = new StateHub(new Store(diwanDir, 0))
    const setupSession = vi.fn()
    const plan = planImport({ nexusConfig: n.cfg, nexusPartitions: n.parts }, fsPlanDeps)
    expect(plan.items).toHaveLength(1)
    expect(plan.items[0].bytes).toBe('session-bytes'.length)

    const result = await applyImport(plan, {
      hub,
      partitionsDir: join(diwanDir, 'Partitions'),
      setupSession,
      log: createLogger(diwanDir, { echo: false }),
    })

    expect(result).toEqual({ imported: ['Account 1'], failed: [] })
    const [acc] = hub.accounts()
    expect(acc.name).toBe('Account 1')
    expect(setupSession).toHaveBeenCalledWith(acc.id)
    expect(readFileSync(join(diwanDir, 'Partitions', `acc-${acc.id}`, 'IndexedDB', 'db.ldb'), 'utf8')).toBe(
      'session-bytes',
    )
    expect(existsSync(join(n.parts, `wa-${ID_A}`, 'IndexedDB', 'db.ldb'))).toBe(true)
    expect(hub.store.get().importedFromNexus).toBe(true)
  })

  test('nexusRunning reads the Chromium singleton lock', () => {
    const n = fakeNexus()
    expect(nexusRunning(n.userData)).toBe(false)
    symlinkSync('joe-cachyos-4242', join(n.userData, 'SingletonLock'))
    expect(
      nexusRunning(
        n.userData,
        (pid) => pid === 4242,
        () => 'electron',
      ),
    ).toBe(true)
    expect(nexusRunning(n.userData, () => false)).toBe(false)
  })

  test('symlinked wa-<id> is not offered; a symlinked sourceDir fails and creates nothing', async () => {
    const n = fakeNexus()
    const real = join(n.root, 'elsewhere')
    mkdirSync(real)
    writeFileSync(join(real, 'x'), '1')
    symlinkSync(real, join(n.parts, `wa-${ID_B}`))
    writeFileSync(
      n.cfg,
      JSON.stringify({
        accounts: [
          { id: ID_A, name: 'A', order: 0 },
          { id: ID_B, name: 'B', order: 1 },
        ],
      }),
    )
    const p = planImport({ nexusConfig: n.cfg, nexusPartitions: n.parts }, fsPlanDeps)
    expect(p.items.map((i) => i.sourceId)).toEqual([ID_A])

    const { hub, parts, diwanDir } = mkHub()
    const r = await applyImport(plan(item(ID_B, join(n.parts, `wa-${ID_B}`), 'B')), {
      hub,
      partitionsDir: parts,
      setupSession: () => {},
      log: quiet(diwanDir),
    })
    expect(r.failed[0].error).toMatch(/not a plain folder/)
    expect(existsSync(parts) ? readdirSync(parts) : []).toEqual([])
    expect(hub.accounts()).toEqual([])
  })

  test('symlinks and FIFOs inside the source are skipped; the source is untouched', async () => {
    const n = fakeNexus()
    const src = join(n.parts, `wa-${ID_A}`)
    const outside = join(n.root, 'outside')
    mkdirSync(outside)
    writeFileSync(join(outside, 'secret'), 's')
    symlinkSync(outside, join(src, 'abs-link'))
    symlinkSync('../../outside', join(src, 'rel-link'))
    let fifo = true
    try {
      execFileSync('mkfifo', [join(src, 'pipe')])
    } catch {
      fifo = false
    }
    const { hub, parts, diwanDir } = mkHub()
    const r = await applyImport(plan(item(ID_A, src, 'A')), {
      hub,
      partitionsDir: parts,
      setupSession: () => {},
      log: quiet(diwanDir),
    })
    expect(r.imported).toEqual(['A'])
    const dest = join(parts, `acc-${hub.accounts()[0].id}`)
    expect(readdirSync(dest)).toEqual(['IndexedDB'])
    expect(lstatSync(join(src, 'abs-link')).isSymbolicLink()).toBe(true)
    expect(lstatSync(join(src, 'rel-link')).isSymbolicLink()).toBe(true)
    if (fifo) expect(lstatSync(join(src, 'pipe')).isFIFO()).toBe(true)
    expect(readFileSync(join(outside, 'secret'), 'utf8')).toBe('s')
  })

  test('sweepPartials removes leftovers and keeps real partitions', async () => {
    const { parts } = mkHub()
    mkdirSync(join(parts, 'acc-one.partial', 'x'), { recursive: true })
    mkdirSync(join(parts, 'acc-two'), { recursive: true })
    await sweepPartials(parts)
    expect(readdirSync(parts)).toEqual(['acc-two'])
    await sweepPartials(join(parts, 'missing'))
  })

  test('rm failures during cleanup never abort the import', async () => {
    const n = fakeNexus()
    const bad = join(n.parts, 'wa-bad')
    mkdirSync(bad)
    const { hub, parts, diwanDir } = mkHub()
    const failingRm = vi.fn().mockRejectedValue(new Error('EBUSY'))
    const r = await applyImport(
      plan(item('bad', join(n.root, 'nope'), 'B'), item(ID_A, join(n.parts, `wa-${ID_A}`), 'A')),
      {
        hub,
        partitionsDir: parts,
        setupSession: () => {},
        log: quiet(diwanDir),
        rm: failingRm as never,
      },
    )
    expect(r.imported).toEqual(['A'])
    expect(r.failed.map((f) => f.name)).toEqual(['B'])
    expect(failingRm).toHaveBeenCalled()
  })

  test('importing twice yields one account per source; markImported only when all are in', async () => {
    const n = fakeNexus()
    mkdirSync(join(n.parts, `wa-${ID_B}`))
    writeFileSync(join(n.parts, `wa-${ID_B}`, 'f'), 'b')
    const { hub, parts, diwanDir } = mkHub()
    const deps = { hub, partitionsDir: parts, setupSession: () => {}, log: quiet(diwanDir) }
    const two = plan(
      item(ID_A, join(n.parts, `wa-${ID_A}`), 'A'),
      item(ID_B, join(n.parts, `wa-${ID_B}`), 'B'),
    )
    // B's source is gone for the first run -> partial success
    const broken = plan(item(ID_A, join(n.parts, `wa-${ID_A}`), 'A'), item(ID_B, join(n.root, 'gone'), 'B'))
    const r1 = await applyImport(broken, deps)
    expect(r1).toMatchObject({ imported: ['A'] })
    expect(r1.failed).toHaveLength(1)
    expect(hub.store.get().importedFromNexus).toBe(false)
    const already = new Set(hub.accounts().flatMap((a) => (a.importedFrom ? [a.importedFrom] : [])))
    const p2 = planImport({ nexusConfig: n.cfg, nexusPartitions: n.parts }, fsPlanDeps, already)
    expect(p2.available).toBe(false)
    expect(p2.reason).toBe('Already imported')
    const r2 = await applyImport(two, deps)
    expect(r2.imported).toEqual(['B'])
    expect(hub.accounts()).toHaveLength(2)
    expect(hub.store.get().importedFromNexus).toBe(true)
  })

  test('plan after partial success offers only the failed one', () => {
    const n = fakeNexus()
    mkdirSync(join(n.parts, `wa-${ID_B}`))
    writeFileSync(
      n.cfg,
      JSON.stringify({
        accounts: [
          { id: ID_A, name: 'A', order: 0 },
          { id: ID_B, name: 'B', order: 1 },
        ],
      }),
    )
    const p = planImport({ nexusConfig: n.cfg, nexusPartitions: n.parts }, fsPlanDeps, new Set([ID_A]))
    expect(p.items.map((i) => i.sourceId)).toEqual([ID_B])
  })

  test('two concurrent imports: one runs, one rejects', async () => {
    const n = fakeNexus()
    const { hub, parts, diwanDir } = mkHub()
    const deps = { hub, partitionsDir: parts, setupSession: () => {}, log: quiet(diwanDir) }
    const p = plan(item(ID_A, join(n.parts, `wa-${ID_A}`), 'A'))
    const results = await Promise.allSettled([applyImport(p, deps), applyImport(p, deps)])
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected'])
    expect(hub.accounts()).toHaveLength(1)
  })

  test('Nexus starting mid-import fails the item and cleans up', async () => {
    const n = fakeNexus()
    const { hub, parts, diwanDir } = mkHub()
    const r = await applyImport(plan(item(ID_A, join(n.parts, `wa-${ID_A}`), 'A')), {
      hub,
      partitionsDir: parts,
      setupSession: () => {},
      log: quiet(diwanDir),
      isNexusRunning: () => true,
    })
    expect(r.failed[0].error).toMatch(/Nexus started during the import/)
    expect(readdirSync(parts)).toEqual([])
    expect(hub.accounts()).toEqual([])
  })

  test('recovery mode rejects at once and copies nothing', async () => {
    const n = fakeNexus()
    const { hub, parts, diwanDir } = mkHub()
    vi.spyOn(hub.store, 'recovery', 'get').mockReturnValue(true)
    await expect(
      applyImport(plan(item(ID_A, join(n.parts, `wa-${ID_A}`), 'A')), {
        hub,
        partitionsDir: parts,
        setupSession: () => {},
        log: quiet(diwanDir),
      }),
    ).rejects.toThrow(/settings file is damaged/)
    expect(existsSync(parts)).toBe(false)
  })

  test('a failed copy (unreadable file halfway) leaves nothing behind', async () => {
    if (process.getuid?.() === 0) return
    const n = fakeNexus()
    const src = join(n.parts, `wa-${ID_A}`)
    writeFileSync(join(src, 'zz-unreadable'), 'x')
    chmodSync(join(src, 'zz-unreadable'), 0)
    const { hub, parts, diwanDir } = mkHub()
    const r = await applyImport(plan(item(ID_A, src, 'Ghost')), {
      hub,
      partitionsDir: parts,
      setupSession: () => {},
      log: quiet(diwanDir),
    })
    expect(r.imported).toEqual([])
    expect(r.failed[0].name).toBe('Ghost')
    expect(readdirSync(parts)).toEqual([])
    expect(hub.accounts()).toEqual([])
    expect(hub.store.get().importedFromNexus).toBe(false)
  })

  test('nexusRunning checks the process name', () => {
    const n = fakeNexus()
    symlinkSync('host-4242', join(n.userData, 'SingletonLock'))
    const alive = () => true
    expect(nexusRunning(n.userData, alive, () => 'electron')).toBe(true)
    expect(nexusRunning(n.userData, alive, () => 'firefox')).toBe(false)
    expect(nexusRunning(n.userData, alive, () => null)).toBe(true)
  })

  test('dirSize of a missing folder is 0', () => {
    expect(dirSize('/nonexistent/dir')).toBe(0)
  })
})

// Reached at startup (hasImportable): anything but a small regular file must return null at once.
describe('fsPlanDeps.readText', () => {
  test('a small regular file is read', () => {
    const d = tmp('diwan-read-')
    writeFileSync(join(d, 'config.json'), '{"accounts":[]}')
    expect(fsPlanDeps.readText(join(d, 'config.json'))).toBe('{"accounts":[]}')
    expect(fsPlanDeps.readText(join(d, 'missing.json'))).toBeNull()
  })

  test('a symlink is never followed, not even to a real file or /dev/zero', () => {
    const d = tmp('diwan-read-')
    writeFileSync(join(d, 'real.json'), '{"accounts":[]}')
    symlinkSync(join(d, 'real.json'), join(d, 'link.json'))
    symlinkSync('/dev/zero', join(d, 'zero.json'))
    expect(fsPlanDeps.readText(join(d, 'link.json'))).toBeNull()
    expect(fsPlanDeps.readText(join(d, 'zero.json'))).toBeNull()
  })

  test('a FIFO returns null without blocking', () => {
    const d = tmp('diwan-read-')
    execFileSync('mkfifo', [join(d, 'config.json')])
    expect(fsPlanDeps.readText(join(d, 'config.json'))).toBeNull()
  })

  test('devices and directories return null', () => {
    expect(fsPlanDeps.readText('/dev/zero')).toBeNull()
    expect(fsPlanDeps.readText(tmp('diwan-read-'))).toBeNull()
  })

  test('a file over the limit returns null; one at the limit is read', () => {
    const d = tmp('diwan-read-')
    writeFileSync(join(d, 'big.json'), Buffer.alloc(MAX_TEXT_BYTES + 1, 0x20))
    writeFileSync(join(d, 'edge.json'), Buffer.alloc(MAX_TEXT_BYTES, 0x20))
    expect(fsPlanDeps.readText(join(d, 'big.json'))).toBeNull()
    expect(fsPlanDeps.readText(join(d, 'edge.json'))?.length).toBe(MAX_TEXT_BYTES)
    expect(readSmallText(join(d, 'edge.json'), 10)).toBeNull()
  })
})
