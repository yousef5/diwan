import { describe, expect, test } from 'vitest'
import { visibleBounds } from '../../src/main/window-bounds'

const displays = [
  { x: 0, y: 0, width: 1920, height: 1080 },
  { x: 1920, y: 0, width: 2560, height: 1440 },
]
const fallback = { width: 1280, height: 820 }

describe('visibleBounds', () => {
  test('no saved bounds → fallback size, centred by Electron', () => {
    expect(visibleBounds(null, displays, fallback)).toEqual(fallback)
  })
  test('on a display → kept', () => {
    const b = { x: 2000, y: 100, width: 1200, height: 800 }
    expect(visibleBounds(b, displays, fallback)).toEqual(b)
  })
  test('on a monitor that is gone → keep size, drop position', () => {
    expect(visibleBounds({ x: 9000, y: 100, width: 1200, height: 800 }, displays, fallback)).toEqual({
      width: 1200,
      height: 800,
    })
  })
  test('barely visible (under 100×100 px) → drop position', () => {
    expect(visibleBounds({ x: 1880, y: 1000, width: 900, height: 700 }, [displays[0]], fallback)).toEqual({
      width: 900,
      height: 700,
    })
  })
})
