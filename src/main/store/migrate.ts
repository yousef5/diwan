import { SCHEMA_VERSION } from './schema'

export type Migration = (raw: Record<string, unknown>) => Record<string, unknown>

// Key = the version a step migrates FROM. Add `1: (x) => ({ ...x, newField: … })` when v2 exists.
export const MIGRATIONS: Record<number, Migration> = {}

export class NewerSchemaError extends Error {}

export function migrate(
  raw: unknown,
  migrations: Record<number, Migration> = MIGRATIONS,
  target = SCHEMA_VERSION,
): unknown {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return raw
  let obj: Record<string, unknown> = { ...(raw as Record<string, unknown>) }
  let version = typeof obj.schemaVersion === 'number' ? obj.schemaVersion : 1
  if (version > target)
    throw new NewerSchemaError(`settings file is schema ${version}, this Diwan understands ${target}`)
  while (version < target) {
    const step = migrations[version]
    if (!step) throw new Error(`no migration from ${version}`)
    obj = step(obj)
    version++
  }
  obj.schemaVersion = version
  return obj
}
