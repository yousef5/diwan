import { describe, expect, test } from 'vitest'
import { migrate, NewerSchemaError } from '../../src/main/store/migrate'

describe('migrate', () => {
  test('current version passes through', () => {
    expect(migrate({ schemaVersion: 1, a: 1 })).toEqual({ schemaVersion: 1, a: 1 })
  })
  test('missing version is treated as 1', () => {
    expect(migrate({ a: 1 })).toEqual({ schemaVersion: 1, a: 1 })
  })
  test('runs each step up to the target', () => {
    const steps = {
      1: (x: Record<string, unknown>) => ({ ...x, b: 2 }),
      2: (x: Record<string, unknown>) => ({ ...x, c: 3 }),
    }
    expect(migrate({ schemaVersion: 1 }, steps, 3)).toEqual({ schemaVersion: 3, b: 2, c: 3 })
  })
  test('a newer file is refused, never downgraded', () => {
    expect(() => migrate({ schemaVersion: 9 })).toThrow(NewerSchemaError)
  })
  test('a missing step throws', () => {
    expect(() => migrate({ schemaVersion: 1 }, {}, 2)).toThrow('no migration from 1')
  })
  test('non-objects pass through for the schema to reject', () => {
    expect(migrate('x')).toBe('x')
  })
})
