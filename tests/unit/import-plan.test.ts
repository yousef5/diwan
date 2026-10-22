import { describe, expect, test } from 'vitest'
import { type PlanDeps, planImport } from '../../src/main/importer/plan'
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
})
