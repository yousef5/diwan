// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest'
import { BADGE_SIZE, badgeLabel, createTrayBadges, paintTrayBadge } from '../../src/renderer/trayBadges'
import { shellChannels } from '../../src/shared/ipc'
import type { BadgeKey } from '../../src/shared/unread'
import { pngHeader, url } from './helpers/images'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('badgeLabel', () => {
  test('nothing at zero, the count up to 9, then 9+', () => {
    expect(badgeLabel(0)).toBeNull()
    expect(badgeLabel(1)).toBe('1')
    expect(badgeLabel(9)).toBe('9')
    expect(badgeLabel(10)).toBe('9+')
    expect(badgeLabel(99)).toBe('9+')
    expect(badgeLabel(100)).toBe('9+')
    expect(badgeLabel(12345)).toBe('9+')
  })

  test('junk counts as nothing; fractions round down', () => {
    expect(badgeLabel(-3)).toBeNull()
    expect(badgeLabel(Number.NaN)).toBeNull()
    expect(badgeLabel(0.5)).toBeNull()
    expect(badgeLabel(2.7)).toBe('2')
  })
})

function harness(opts: { paint?: (k: BadgeKey) => string | null; send?: () => Promise<boolean> } = {}) {
  const events: string[] = []
  const deps = {
    ready: vi.fn(async () => {
      events.push('ready')
    }),
    paint: vi.fn((k: BadgeKey) => {
      events.push(`paint ${k}`)
      return opts.paint ? opts.paint(k) : `data:image/png;base64,${k}`
    }),
    send: vi.fn(async (images: Record<string, string>) => {
      events.push(`send ${Object.keys(images).join(',')}`)
      return opts.send ? opts.send() : true
    }),
  }
  return { badges: createTrayBadges(deps), deps, events }
}

describe('createTrayBadges', () => {
  test('draws a key the first time it is needed, after the font, and sends only that key', async () => {
    const { badges, deps, events } = harness()
    await badges.show(3)
    expect(events).toEqual(['ready', 'paint 3', 'send 3'])
    expect(deps.send).toHaveBeenCalledWith({ 3: 'data:image/png;base64,3' })
  })

  test('the same count, or another count with the same badge, does nothing', async () => {
    const { badges, deps } = harness()
    await badges.show(12)
    await badges.show(12)
    await badges.show(40)
    await badges.show(150)
    expect(deps.paint).toHaveBeenCalledTimes(1)
    expect(deps.send).toHaveBeenCalledTimes(1)
  })

  test('an image main already has is never drawn or sent again', async () => {
    const { badges, deps } = harness()
    for (const n of [0, 1, 0, 1, 2, 1, 0]) await badges.show(n)
    expect(deps.paint.mock.calls.map(([k]) => k)).toEqual(['none', '1', '2'])
    expect(deps.send).toHaveBeenCalledTimes(3)
  })

  test('counts that change while one is being drawn each send their own key once', async () => {
    const { badges, deps } = harness()
    await Promise.all([badges.show(1), badges.show(2), badges.show(1), badges.show(2)])
    expect(deps.paint.mock.calls.map(([k]) => k).sort()).toEqual(['1', '2'])
  })

  test('a refused image is tried again on the next change', async () => {
    let ok = false
    const { badges, deps } = harness({ send: async () => ok })
    await badges.show(4)
    ok = true
    await badges.show(0)
    await badges.show(4)
    expect(deps.paint.mock.calls.map(([k]) => k)).toEqual(['4', 'none', '4'])
    await badges.show(0)
    await badges.show(4)
    expect(deps.send).toHaveBeenCalledTimes(3)
  })

  test('a refused image gets one more try on the next snapshot with the same total', async () => {
    let ok = false
    const { badges, deps } = harness({ send: async () => ok })
    await badges.show(4) // the total moved onto 4 and the send failed
    expect(deps.send).toHaveBeenCalledTimes(1)
    await badges.show(4) // next snapshot, same total: one more try (still refused)
    expect(deps.send).toHaveBeenCalledTimes(2)
    ok = true
    await badges.show(4) // and the next one gets it through
    expect(deps.send).toHaveBeenCalledTimes(3)
    // once main has it, the same total costs nothing again
    await badges.show(4)
    await badges.show(5)
    await badges.show(4)
    expect(deps.paint.mock.calls.map(([k]) => k)).toEqual(['4', '4', '4', '5'])
  })

  test('a failure for a key the total already left does not reset the newer key', async () => {
    let release: (ok: boolean) => void = () => {}
    const sends: string[] = []
    const badges = createTrayBadges({
      ready: async () => {},
      paint: (k) => `data:${k}`,
      send: (images) => {
        sends.push(Object.keys(images).join())
        return Object.keys(images)[0] === '3'
          ? new Promise<boolean>((r) => (release = r))
          : Promise.resolve(true)
      },
    })
    const first = badges.show(3)
    await badges.show(5) // the total moved on while 3 was being sent
    release(false)
    await first
    await badges.show(5) // 5 is still the last key and main has it: nothing to do
    expect(sends).toEqual(['3', '5'])
  })

  test('no canvas: nothing is sent, and nothing is remembered as sent', async () => {
    const { badges, deps } = harness({ paint: () => null })
    await badges.show(5)
    expect(deps.send).not.toHaveBeenCalled()
    await badges.show(0)
    await badges.show(5)
    expect(deps.paint).toHaveBeenCalledTimes(3)
  })

  test('a throwing step never rejects', async () => {
    const badges = createTrayBadges({
      ready: async () => {
        throw new Error('fonts')
      },
      paint: () => 'x',
      send: async () => true,
    })
    await expect(badges.show(1)).resolves.toBeUndefined()
  })
})

// A 2D context that records what is drawn.
function fakeCanvas() {
  const calls: unknown[][] = []
  const ctx = new Proxy(
    { fillStyle: '', font: '', globalCompositeOperation: 'source-over' } as Record<string, unknown>,
    {
      get(target, prop: string) {
        if (prop in target) return target[prop]
        return (...args: unknown[]) => {
          calls.push([prop, ...args, { fillStyle: target.fillStyle, font: target.font }])
        }
      },
    },
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as RenderingContext)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA')
  vi.stubGlobal('Path2D', class {})
  return calls
}

describe('paintTrayBadge', () => {
  test('a count: the badge in accent-strong with white text', () => {
    const calls = fakeCanvas()
    expect(paintTrayBadge('9+')).toBe('data:image/png;base64,AAAA')
    const text = calls.filter((c) => c[0] === 'fillText')
    expect(text).toHaveLength(1)
    expect(text[0][1]).toBe('9+')
    expect(text[0][4]).toMatchObject({ fillStyle: '#ffffff' })
    // The fill right before the text is the badge disc.
    const fills = calls.filter((c) => c[0] === 'fill')
    expect(fills.at(-1)?.[1]).toMatchObject({ fillStyle: '#2563eb' })
  })

  test('none: the plain icon, no text', () => {
    const calls = fakeCanvas()
    paintTrayBadge('none')
    expect(calls.some((c) => c[0] === 'fillText')).toBe(false)
  })

  test('no 2D context: null', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    expect(paintTrayBadge('1')).toBeNull()
  })

  test('a badge-sized PNG is what tray:setBadges accepts', () => {
    const png = url('png', pngHeader(BADGE_SIZE, BADGE_SIZE))
    expect(shellChannels['tray:setBadges'].safeParse({ none: png, '9+': png }).success).toBe(true)
  })
})
