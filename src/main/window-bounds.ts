import type { Rect } from '../shared/types'

const MIN_VISIBLE = 100
const TITLE_BAND = 30
const MIN_SIZE = 200

function overlap(a: Rect, b: Rect): { w: number; h: number } {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return { w: Math.max(0, w), h: Math.max(0, h) }
}

function clampSize(value: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(Math.max(value, MIN_SIZE), max)
}

// Saved bounds are reused only if at least 100×100 px of the window lands on a current display
// and its title bar (top 30 px) is on that display too. Sizes are clamped to the largest display.
export function visibleBounds(
  saved: Rect | null,
  displays: Rect[],
  fallback: { width: number; height: number },
): Rect | { width: number; height: number } {
  const maxW = displays.length ? Math.max(...displays.map((d) => d.width)) : Number.POSITIVE_INFINITY
  const maxH = displays.length ? Math.max(...displays.map((d) => d.height)) : Number.POSITIVE_INFINITY
  const size = {
    width: clampSize(saved?.width ?? Number.NaN, maxW, clampSize(fallback.width, maxW, fallback.width)),
    height: clampSize(saved?.height ?? Number.NaN, maxH, clampSize(fallback.height, maxH, fallback.height)),
  }
  if (!saved) return size
  if (![saved.x, saved.y].every(Number.isFinite)) return size
  const placed: Rect = { x: saved.x, y: saved.y, ...size }
  const band: Rect = { ...placed, height: Math.min(TITLE_BAND, size.height) }
  const onScreen = displays.some((d) => {
    const o = overlap(placed, d)
    const t = overlap(band, d)
    return o.w >= MIN_VISIBLE && o.h >= MIN_VISIBLE && t.w >= MIN_VISIBLE && t.h >= band.height
  })
  return onScreen ? placed : size
}
