import { describe, expect, test } from 'vitest'
import { ACCOUNT_COLORS, colorForIndex } from '../../src/shared/palette'

describe('palette', () => {
  test('has 8 distinct hex colours', () => {
    expect(ACCOUNT_COLORS).toHaveLength(8)
    expect(new Set(ACCOUNT_COLORS).size).toBe(8)
    for (const c of ACCOUNT_COLORS) expect(c).toMatch(/^#[0-9a-f]{6}$/)
  })

  test('colorForIndex cycles', () => {
    expect(colorForIndex(0)).toBe(ACCOUNT_COLORS[0])
    expect(colorForIndex(8)).toBe(ACCOUNT_COLORS[0])
    expect(colorForIndex(9)).toBe(ACCOUNT_COLORS[1])
    expect(colorForIndex(-1)).toBe(ACCOUNT_COLORS[7])
    expect(colorForIndex(Number.NaN)).toBe(ACCOUNT_COLORS[0])
    expect(colorForIndex(Number.POSITIVE_INFINITY)).toBe(ACCOUNT_COLORS[0])
  })
})
