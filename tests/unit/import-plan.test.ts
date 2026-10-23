import { describe, expect, test } from 'vitest'
import { hasImportable, type PlanDeps, planForApply, planImport } from '../../src/main/importer/plan'
import { ACCOUNT_COLORS } from '../../src/shared/palette'

const paths = {
  nexusConfig: '/h/.newwhatsapp/config.json',
  nexusPartitions: '/h/.config/MultiWhatsApp/Partitions',
}
const deps = (config: string | null, dirs: string[]): PlanDeps => ({
  readText: () => config,
  listDir: () => dirs,
  dirSize: (p) => (p.endsWith('aaa') ? 1000 : 50),
})
const cfg = (accounts: object[]) => JSON.stringify({ accounts, settings: {} })

describe('planImport', () => {
  test('no Nexus', () => {
    expect(planImport(paths, deps(null, []))).toMatchObject({
      available: false,
      reason: 'Nexus is not installed on this computer',
    })
  })

  test('damaged config', () => {
    expect(planImport(paths, deps('{oops', [])).reason).toBe('Nexus settings file is damaged')
    expect(planImport(paths, deps('{"accounts":5}', [])).reason).toBe('Nexus settings file is damaged')
  })

  test('live accounts only, in Nexus order, orphans counted', () => {
    const plan = planImport(
      paths,
      deps(
        cfg([
          { id: 'bbb', name: 'Account 2', order: 1 },
          { id: 'aaa', name: 'Account 1', order: 0 },
          { id: 'ccc', name: 'Gone', order: 2 },
        ]),
        ['wa-aaa', 'wa-bbb', 'wa-old1', 'wa-old2', 'other'],
      ),
    )
    expect(plan.available).toBe(true)
    expect(plan.items).toEqual([
      {
        sourceId: 'aaa',
        name: 'Account 1',
        color: ACCOUNT_COLORS[0],
        sourceDir: `${paths.nexusPartitions}/wa-aaa`,
        bytes: 1000,
      },
      {
        sourceId: 'bbb',
        name: 'Account 2',
        color: ACCOUNT_COLORS[1],
        sourceDir: `${paths.nexusPartitions}/wa-bbb`,
        bytes: 50,
      },
    ])
    expect(plan.orphanDirs).toBe(2)
  })

  test('blank or long names are fixed', () => {
    const plan = planImport(
      paths,
      deps(
        cfg([
          { id: 'aaa', name: '  ' },
          { id: 'bbb', name: 'x'.repeat(60) },
        ]),
        ['wa-aaa', 'wa-bbb'],
      ),
    )
    expect(plan.items.map((i) => i.name)).toEqual(['Account 1', 'x'.repeat(40)])
  })

  test('accounts without a session folder → nothing to import', () => {
    expect(planImport(paths, deps(cfg([{ id: 'aaa', name: 'A' }]), []))).toMatchObject({
      available: false,
      reason: 'Nexus has no signed-in accounts',
      items: [],
    })
  })

  test('unsafe ids are skipped, not rejected', () => {
    const plan = planImport(
      paths,
      deps(
        cfg([
          { id: '../x', name: 'Evil' },
          { id: 'aaa', name: 'A' },
        ]),
        ['wa-aaa', 'wa-../x'],
      ),
    )
    expect(plan.items.map((i) => i.sourceId)).toEqual(['aaa'])
    expect(plan.items.every((i) => i.sourceDir.startsWith(`${paths.nexusPartitions}/wa-`))).toBe(true)
  })

  test('only an unsafe id -> no signed-in accounts', () => {
    expect(planImport(paths, deps(cfg([{ id: '../x', name: 'Evil' }]), ['wa-../x']))).toMatchObject({
      available: false,
      reason: 'Nexus has no signed-in accounts',
      items: [],
    })
  })

  test('duplicate ids give one item, first kept', () => {
    const plan = planImport(
      paths,
      deps(
        cfg([
          { id: 'aaa', name: 'First' },
          { id: 'aaa', name: 'Second' },
        ]),
        ['wa-aaa'],
      ),
    )
    expect(plan.items.map((i) => i.name)).toEqual(['First'])
  })

  test('missing order sorts as 0', () => {
    const plan = planImport(
      paths,
      deps(
        cfg([
          { id: 'bbb', name: 'B', order: 1 },
          { id: 'aaa', name: 'A' },
        ]),
        ['wa-aaa', 'wa-bbb'],
      ),
    )
    expect(plan.items.map((i) => i.sourceId)).toEqual(['aaa', 'bbb'])
  })

  test('orphans are counted even with no live accounts', () => {
    const plan = planImport(paths, deps(cfg([]), ['wa-old1', 'wa-old2']))
    expect(plan).toMatchObject({ available: false, orphanDirs: 2 })
  })

  test('names are trimmed again after truncation', () => {
    const plan = planImport(paths, deps(cfg([{ id: 'aaa', name: `${'x'.repeat(39)} yyy` }]), ['wa-aaa']))
    expect(plan.items[0]?.name).toBe('x'.repeat(39))
  })
})

describe('planForApply (the re-plan right before copying)', () => {
  test('nothing to import for any reason but "already imported" is an error with that reason', () => {
    expect(() => planForApply(planImport(paths, deps(null, [])))).toThrow(
      'Nexus is not installed on this computer',
    )
    expect(() => planForApply(planImport(paths, deps('{oops', [])))).toThrow('Nexus settings file is damaged')
    expect(() => planForApply(planImport(paths, deps(cfg([{ id: 'aaa', name: 'A' }]), [])))).toThrow(
      'Nexus has no signed-in accounts',
    )
    expect(() =>
      planForApply({ available: false, reason: null, items: [], orphanDirs: 0, nexusRunning: false }),
    ).toThrow('Nothing to import')
  })

  test('"already imported" and a real plan pass through', () => {
    const all = planImport(paths, deps(cfg([{ id: 'aaa', name: 'A' }]), ['wa-aaa']), new Set(['aaa']))
    expect(all.reason).toBe('Already imported')
    expect(planForApply(all)).toBe(all)
    const plan = planImport(paths, deps(cfg([{ id: 'aaa', name: 'A' }]), ['wa-aaa']))
    expect(planForApply(plan)).toBe(plan)
  })
})

describe('hasImportable', () => {
  const two = cfg([
    { id: 'aaa', name: 'One', order: 0 },
    { id: 'bbb', name: 'Two', order: 1 },
  ])

  test('no Nexus, a damaged file, or no signed-in accounts: nothing to offer', () => {
    expect(hasImportable(paths, deps(null, []))).toBe(false)
    expect(hasImportable(paths, deps('{oops', ['wa-aaa']))).toBe(false)
    expect(hasImportable(paths, deps(two, []))).toBe(false)
    expect(hasImportable(paths, deps(two, ['wa-old', 'other']))).toBe(false)
  })

  test('an account with a session folder that is not in Diwan yet', () => {
    expect(hasImportable(paths, deps(two, ['wa-bbb']))).toBe(true)
    expect(hasImportable(paths, deps(two, ['wa-aaa', 'wa-bbb']), new Set(['aaa']))).toBe(true)
    expect(hasImportable(paths, deps(two, ['wa-aaa', 'wa-bbb']), new Set(['aaa', 'bbb']))).toBe(false)
  })

  test('never measures folder sizes', () => {
    let measured = 0
    const d: PlanDeps = { ...deps(two, ['wa-aaa', 'wa-bbb']), dirSize: () => ++measured }
    expect(hasImportable(paths, d)).toBe(true)
    expect(measured).toBe(0)
  })
})
