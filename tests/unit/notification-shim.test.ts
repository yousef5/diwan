// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { installNotificationShim } from '../../src/preload/notification-shim'

type Bridge = { show: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }
type W = { __diwanNotify?: Bridge; __diwanShimmed?: boolean; __diwanClick?: (nid: string) => void }
type Shown = { nid: string; title: string; body: string; tag: string; icon: string; silent: boolean }
const w = window as unknown as W

// The shim replaces window.Notification after jsdom set the globals up, so always go through window.
const N = () => (window as unknown as { Notification: typeof Notification }).Notification
const notify = (title: string, options?: NotificationOptions & { icon?: string }) => new (N())(title, options)

// A fresh page: what a guest reload looks like to the shim.
const newPage = () => {
  delete w.__diwanShimmed
  installNotificationShim()
}

const shown = (i = 0) => bridge.show.mock.calls[i]?.[0] as Shown
const settle = () => new Promise((r) => setTimeout(r, 0))

let bridge: Bridge
beforeEach(() => {
  bridge = { show: vi.fn(), close: vi.fn() }
  w.__diwanNotify = bridge
  window.focus = vi.fn() // jsdom doesn't implement it
  newPage()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('notification shim', () => {
  test('reports granted permission', async () => {
    expect(N().permission).toBe('granted')
    await expect(N().requestPermission()).resolves.toBe('granted')
    const cb = vi.fn()
    await N().requestPermission(cb)
    expect(cb).toHaveBeenCalledWith('granted')
  })

  test('does nothing without the preload bridge', () => {
    const before = N()
    delete w.__diwanNotify
    newPage()
    expect(N()).toBe(before)
    expect(w.__diwanShimmed).toBeUndefined() // a later install, once the bridge exists, still runs
  })

  test('forwards a notification to main', async () => {
    notify('Ali', { body: 'hi', tag: 'chat-1' })
    await vi.waitFor(() =>
      expect(bridge.show).toHaveBeenCalledWith({
        nid: expect.stringMatching(/^[a-z0-9]+-1$/),
        title: 'Ali',
        body: 'hi',
        tag: 'chat-1',
        icon: '',
        silent: false,
      }),
    )
  })

  test('fires show asynchronously, like the real API', async () => {
    const n = notify('Ali')
    const onshow = vi.fn()
    const listener = vi.fn()
    n.onshow = onshow
    n.addEventListener('show', listener)
    expect(onshow).not.toHaveBeenCalled()
    await settle()
    expect(onshow).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledOnce()
  })

  test('texts are cut to what main accepts', async () => {
    notify('t'.repeat(600), { body: 'b'.repeat(5000), tag: 'g'.repeat(600) })
    await vi.waitFor(() => expect(bridge.show).toHaveBeenCalledOnce())
    expect(shown().title).toHaveLength(500)
    expect(shown().body).toHaveLength(4000)
    expect(shown().tag).toHaveLength(500)
  })

  test('a click from main replays WhatsApp’s own onclick, once', async () => {
    const n = notify('Ali', { body: 'hi' })
    const onclick = vi.fn()
    const listener = vi.fn()
    n.onclick = onclick
    n.addEventListener('click', listener)
    await vi.waitFor(() => expect(bridge.show).toHaveBeenCalledOnce())
    w.__diwanClick?.(shown().nid)
    expect(window.focus).toHaveBeenCalledOnce()
    expect(onclick).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledOnce()
    w.__diwanClick?.(shown().nid)
    expect(onclick).toHaveBeenCalledOnce()
  })

  test('a click for an older page never matches a new page’s notification', async () => {
    notify('old')
    await vi.waitFor(() => expect(bridge.show).toHaveBeenCalledOnce())
    const oldNid = shown(0).nid
    newPage()
    const n = notify('new')
    const onclick = vi.fn()
    n.onclick = onclick
    await vi.waitFor(() => expect(bridge.show).toHaveBeenCalledTimes(2))
    expect(shown(1).nid).not.toBe(oldNid)
    expect(shown(1).nid).toMatch(/-1$/)
    w.__diwanClick?.(oldNid)
    expect(onclick).not.toHaveBeenCalled()
  })

  test('close() tells main once and fires onclose', () => {
    const n = notify('Ali')
    const onclose = vi.fn()
    n.onclose = onclose
    n.close()
    n.close()
    expect(bridge.close).toHaveBeenCalledOnce()
    expect(bridge.close).toHaveBeenCalledWith(expect.stringMatching(/^[a-z0-9]+-1$/))
    expect(onclose).toHaveBeenCalledOnce()
  })

  test('a notification closed before it went out is never shown', async () => {
    const n = notify('Ali')
    n.close()
    await settle()
    expect(bridge.show).not.toHaveBeenCalled()
  })

  test('a closed notification ignores a later click', async () => {
    const n = notify('Ali')
    const onclick = vi.fn()
    n.onclick = onclick
    await vi.waitFor(() => expect(bridge.show).toHaveBeenCalledOnce())
    n.close()
    w.__diwanClick?.(shown().nid)
    expect(onclick).not.toHaveBeenCalled()
  })

  test('keeps at most 100 live notifications, dropping the oldest', async () => {
    const first = notify('n0')
    const firstClick = vi.fn()
    first.onclick = firstClick
    await vi.waitFor(() => expect(bridge.show).toHaveBeenCalledOnce())
    let last = first
    for (let i = 1; i <= 100; i++) last = notify(`n${i}`)
    const lastClick = vi.fn()
    last.onclick = lastClick
    await vi.waitFor(() => expect(bridge.show).toHaveBeenCalledTimes(101))
    w.__diwanClick?.(shown(0).nid)
    w.__diwanClick?.(shown(100).nid)
    expect(firstClick).not.toHaveBeenCalled()
    expect(lastClick).toHaveBeenCalledOnce()
  })

  test('installing twice keeps the first shim, so earlier notifications stay clickable', async () => {
    const n = notify('x')
    const onclick = vi.fn()
    n.onclick = onclick
    installNotificationShim()
    await vi.waitFor(() => expect(bridge.show).toHaveBeenCalledOnce())
    w.__diwanClick?.(shown().nid)
    expect(onclick).toHaveBeenCalledOnce()
    expect(N().permission).toBe('granted')
  })

  test('still works after Function.toString() serialisation (how executeInMainWorld ships it)', async () => {
    const shipped = new Function(`return (${installNotificationShim.toString()})`)() as () => void
    delete w.__diwanShimmed
    shipped()
    const n = notify('Ali', { body: 'hi' })
    const onclick = vi.fn()
    n.onclick = onclick
    await vi.waitFor(() => expect(bridge.show).toHaveBeenCalledOnce())
    w.__diwanClick?.(shown().nid)
    expect(onclick).toHaveBeenCalledOnce()
  })
})

describe('notification icon', () => {
  // jsdom has no createImageBitmap or OffscreenCanvas: stand in for the browser's decoder.
  function stubImagePipeline(size: { width: number; height: number }, out = 'image/png') {
    const canvases: { w: number; h: number }[] = []
    const close = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ blob: async () => new Blob(['src']) })),
    )
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ ...size, close })),
    )
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        constructor(w: number, h: number) {
          canvases.push({ w, h })
        }
        getContext() {
          return { drawImage: () => {} }
        }
        async convertToBlob() {
          return new Blob(['png'], { type: out })
        }
      },
    )
    return { canvases, close }
  }

  test('is re-encoded to a PNG of at most 256 px', async () => {
    const { canvases, close } = stubImagePipeline({ width: 1000, height: 500 })
    notify('Ali', { icon: 'blob:https://web.whatsapp.com/x' })
    await vi.waitFor(() => expect(bridge.show).toHaveBeenCalledOnce())
    expect(canvases).toEqual([{ w: 256, h: 128 }])
    expect(close).toHaveBeenCalledOnce()
    expect(shown().icon).toMatch(/^data:image\/png;base64,/)
  })

  test('anything but a PNG is dropped, and the notification still goes out', async () => {
    stubImagePipeline({ width: 64, height: 64 }, 'image/webp')
    notify('Ali', { icon: 'blob:https://web.whatsapp.com/x' })
    await vi.waitFor(() => expect(bridge.show).toHaveBeenCalledOnce())
    expect(shown().icon).toBe('')
  })

  test('an icon that fails to load is dropped', async () => {
    stubImagePipeline({ width: 64, height: 64 })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('blocked')
      }),
    )
    notify('Ali', { icon: 'https://example.com/a.webp' })
    await vi.waitFor(() => expect(bridge.show).toHaveBeenCalledOnce())
    expect(shown()).toMatchObject({ title: 'Ali', icon: '' })
  })

  test('a hung icon download gives up after 1.5 s instead of losing the notification', async () => {
    vi.useFakeTimers()
    stubImagePipeline({ width: 64, height: 64 })
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    )
    notify('Ali', { icon: 'https://example.com/a.webp' })
    await vi.advanceTimersByTimeAsync(1400)
    expect(bridge.show).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(200)
    expect(bridge.show).toHaveBeenCalledOnce()
    expect(shown().icon).toBe('')
  })
})
