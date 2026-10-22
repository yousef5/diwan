import { join } from 'node:path'
import { z } from 'zod'
import { colorForIndex } from '../../shared/palette'
import type { ImportItem, ImportPlan } from '../../shared/types'

export interface PlanDeps {
  readText(path: string): string | null
  listDir(path: string): string[]
  dirSize(path: string): number
}

const NexusConfig = z.object({
  accounts: z.array(z.object({ id: z.string(), name: z.string(), order: z.number().optional() })),
})

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/

const unavailable = (reason: string): ImportPlan => ({
  available: false,
  reason,
  items: [],
  orphanDirs: 0,
  nexusRunning: false,
})

export function planImport(
  paths: { nexusConfig: string; nexusPartitions: string },
  deps: PlanDeps,
): ImportPlan {
  const raw = deps.readText(paths.nexusConfig)
  if (raw === null) return unavailable('Nexus is not installed on this computer')
  let parsed: z.infer<typeof NexusConfig>
  try {
    parsed = NexusConfig.parse(JSON.parse(raw))
  } catch {
    return unavailable('Nexus settings file is damaged')
  }

  const dirs = new Set(deps.listDir(paths.nexusPartitions))
  const sorted = [...parsed.accounts]
    .filter((a) => SAFE_ID.test(a.id))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const accounts = sorted.filter((a, i) => sorted.findIndex((b) => b.id === a.id) === i)
  const items: ImportItem[] = accounts
    .filter((a) => dirs.has(`wa-${a.id}`))
    .map((a, i) => {
      const sourceDir = join(paths.nexusPartitions, `wa-${a.id}`)
      return {
        sourceId: a.id,
        name: a.name.trim().slice(0, 40).trim() || `Account ${i + 1}`,
        color: colorForIndex(i),
        sourceDir,
        bytes: deps.dirSize(sourceDir),
      }
    })
  const live = new Set(accounts.map((a) => `wa-${a.id}`))
  const orphanDirs = [...dirs].filter((d) => d.startsWith('wa-') && !live.has(d)).length
  if (items.length === 0) return { ...unavailable('Nexus has no signed-in accounts'), orphanDirs }
  return { available: true, reason: null, items, orphanDirs, nexusRunning: false }
}
