import { describe, expect, test, vi } from 'vitest'
import { TaskbarBadge } from '../../src/main/taskbar-badge'
import type { Platform } from '../../src/shared/types'

function harness(platform: Platform, opts: { win?: boolean } = {}) {
  const overlay: [string | null, string][] = []
  const fakeWin = {
    setOverlayIcon: (img: string | null, desc: string) => overlay.push([img, desc]),
    isDestroyed: () => false,
  }
  const setBadgeCount = vi.fn((_n: number) => true)
  const warn = vi.fn()
  const badge = new TaskbarBadge<string>({
    platform,
    win: () => (opts.win === false ? null : fakeWin),
    decode: (u) => `img(${u})`,
    setBadgeCount,
    warn,
  })
  return { badge, overlay, setBadgeCount, warn }
}

describe('TaskbarBadge on Windows', () => {
  test('sets the overlay for a count, and clears it with null at 0', () => {
    const { badge, overlay, setBadgeCount } = harness('win32')
    badge.setImages({ 3: 'u3', '9+': 'u9' })
    overlay.length = 0
    badge.update(3)
    badge.update(42)
    badge.update(0)
    expect(overlay).toEqual([
      ['img(u3)', '3 unread'],
      ['img(u9)', '42 unread'],
      [null, ''],
    ])
    expect(setBadgeCount).not.toHaveBeenCalled()
  })

  test('the same total sets nothing again; a new total behind the same 9+ updates the description', () => {
    const { badge, overlay } = harness('win32')
    badge.setImages({ '9+': 'u9' })
    overlay.length = 0
    badge.update(12)
    badge.update(12)
    badge.update(13)
    badge.update(0)
    badge.update(0)
    expect(overlay).toEqual([
      ['img(u9)', '12 unread'],
      ['img(u9)', '13 unread'],
      [null, ''],
    ])
  })

  test('an image that arrives after the total shows at once', () => {
    const { badge, overlay } = harness('win32')
    badge.update(5)
    expect(overlay).toEqual([])
    badge.setImages({ 5: 'u5' })
    expect(overlay).toEqual([['img(u5)', '5 unread']])
  })

  test('no window yet: nothing happens', () => {
    const { badge, overlay } = harness('win32', { win: false })
    badge.setImages({ 1: 'u1' })
    badge.update(1)
    expect(overlay).toEqual([])
  })
})

describe('TaskbarBadge on Linux', () => {
  test('sets the launcher count when the total changes, never an overlay', () => {
    const { badge, overlay, setBadgeCount } = harness('linux')
    badge.setImages({ 1: 'u1' })
    badge.update(0)
    badge.update(4)
    badge.update(4)
    badge.update(0)
    expect(setBadgeCount.mock.calls.map(([n]) => n)).toEqual([0, 4, 0])
    expect(overlay).toEqual([])
  })

  test('a desktop that refuses the count is only logged', () => {
    const { badge, setBadgeCount, warn } = harness('linux')
    setBadgeCount.mockImplementation(() => {
      throw new Error('no launcher')
    })
    expect(() => badge.update(2)).not.toThrow()
    expect(warn).toHaveBeenCalledOnce()
  })
})

test('macOS: neither an overlay nor a count', () => {
  const { badge, overlay, setBadgeCount } = harness('darwin')
  badge.setImages({ 1: 'u1' })
  badge.update(1)
  expect(overlay).toEqual([])
  expect(setBadgeCount).not.toHaveBeenCalled()
})
