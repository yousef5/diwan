import type { Rect } from '../shared/types'

const MIN_VISIBLE = 100

function overlap(a: Rect, b: Rect): { w: number; h: number } {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return { w: Math.max(0, w), h: Math.max(0, h) }
}

// Saved bounds are reused only if at least 100×100 px of the window lands on a current display.
export function visibleBounds(
  saved: Rect | null,
  displays: Rect[],
  fallback: { width: number; height: number },
): Rect | { width: number; height: number } {
  if (!saved) return fallback
  const onScreen = displays.some((d) => {
    const o = overlap(saved, d)
    return o.w >= MIN_VISIBLE && o.h >= MIN_VISIBLE
  })
  return onScreen ? saved : { width: saved.width, height: saved.height }
}
