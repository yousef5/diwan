import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import { applyImport, dirSize, fsPlanDeps, nexusRunning } from '../../src/main/importer/apply'
import { planImport } from '../../src/main/importer/plan'
import { createLogger } from '../../src/main/log'
import { StateHub } from '../../src/main/state'
import { Store } from '../../src/main/store/store'

const ID_A = '649d14d5-ebb9-4ed6-9725-633b89c6ceac'

function fakeNexus() {
  const root = mkdtempSync(join(tmpdir(), 'nexus-'))
  const parts = join(root, 'MultiWhatsApp', 'Partitions')
  mkdirSync(join(parts, `wa-${ID_A}`, 'IndexedDB'), { recursive: true })
  writeFileSync(join(parts, `wa-${ID_A}`, 'IndexedDB', 'db.ldb'), 'session-bytes')
  mkdirSync(join(parts, 'wa-orphan'), { recursive: true })
  const cfg = join(root, 'config.json')
  writeFileSync(cfg, JSON.stringify({ accounts: [{ id: ID_A, name: 'Account 1', order: 0 }] }))
  return { root, parts, cfg, userData: join(root, 'MultiWhatsApp') }
}

describe('import apply', () => {
  test('copies the session, registers the account, leaves Nexus untouched', async () => {
    const n = fakeNexus()
    const diwanDir = mkdtempSync(join(tmpdir(), 'diwan-'))
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

  test('a failed copy is reported and cleaned up', async () => {
    const diwanDir = mkdtempSync(join(tmpdir(), 'diwan-'))
    const hub = new StateHub(new Store(diwanDir, 0))
    const result = await applyImport(
      {
        available: true,
        reason: null,
        orphanDirs: 0,
        nexusRunning: false,
        items: [{ sourceId: 'x', name: 'Ghost', color: '#3b82f6', sourceDir: '/nonexistent/dir', bytes: 0 }],
      },
      {
        hub,
        partitionsDir: join(diwanDir, 'Partitions'),
        setupSession: () => {},
        log: createLogger(diwanDir, { echo: false }),
      },
    )
    expect(result.imported).toEqual([])
    expect(result.failed[0].name).toBe('Ghost')
    expect(hub.accounts()).toEqual([])
    expect(hub.store.get().importedFromNexus).toBe(false)
  })

  test('nexusRunning reads the Chromium singleton lock', () => {
    const n = fakeNexus()
    expect(nexusRunning(n.userData)).toBe(false)
    symlinkSync('joe-cachyos-4242', join(n.userData, 'SingletonLock'))
    expect(nexusRunning(n.userData, (pid) => pid === 4242)).toBe(true)
    expect(nexusRunning(n.userData, () => false)).toBe(false)
  })

  test('dirSize of a missing folder is 0', () => {
    expect(dirSize('/nonexistent/dir')).toBe(0)
  })
})
