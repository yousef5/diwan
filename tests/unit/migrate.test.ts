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
  test('a present but invalid schemaVersion throws', () => {
    for (const v of ['2', null, 0, -1, 1.5, Number.NaN]) {
      expect(() => migrate({ schemaVersion: v })).toThrow('bad schemaVersion')
    }
  })
  test('newer than an explicit target is refused', () => {
    expect(() => migrate({ schemaVersion: 3 }, {}, 2)).toThrow(NewerSchemaError)
  })
  test('does not mutate its input', () => {
    const input = { schemaVersion: 1, nested: { a: 1 } }
    const copy = structuredClone(input)
    migrate(input, { 1: (x) => ({ ...x, b: 2 }) }, 2)
    expect(input).toEqual(copy)
  })
})
