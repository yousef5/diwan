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

describe('visibleBounds with the real 3-monitor layout', () => {
  const three = [
    { x: 0, y: 0, width: 1920, height: 1080 },
    { x: 1920, y: 0, width: 2560, height: 1440 },
    { x: 4480, y: 0, width: 1920, height: 1080 },
  ]
  test('window on the third monitor is kept', () => {
    const b = { x: 4600, y: 50, width: 1000, height: 700 }
    expect(visibleBounds(b, three, fallback)).toEqual(b)
  })
  test('negative coordinates: partly on screen is kept, fully off is dropped', () => {
    const kept = { x: -800, y: 0, width: 1000, height: 700 }
    expect(visibleBounds(kept, three, fallback)).toEqual(kept)
    expect(visibleBounds({ x: -2000, y: 0, width: 1000, height: 700 }, three, fallback)).toEqual({
      width: 1000,
      height: 700,
    })
  })
  test('exact 100x100 boundary is kept', () => {
    const b = { x: 1820, y: 0, width: 900, height: 700 }
    expect(visibleBounds(b, [three[0]], fallback)).toEqual(b)
  })
  test('title bar above the screen drops the position', () => {
    expect(visibleBounds({ x: 100, y: -50, width: 900, height: 700 }, three, fallback)).toEqual({
      width: 900,
      height: 700,
    })
  })
  test('huge saved size is clamped to the largest display', () => {
    expect(visibleBounds({ x: 0, y: 0, width: 9999, height: 9999 }, three, fallback)).toEqual({
      x: 0,
      y: 0,
      width: 2560,
      height: 1440,
    })
  })
  test('non-finite size falls back', () => {
    expect(visibleBounds({ x: 0, y: 0, width: Number.NaN, height: 700 }, three, fallback)).toEqual({
      x: 0,
      y: 0,
      width: 1280,
      height: 700,
    })
  })
})
