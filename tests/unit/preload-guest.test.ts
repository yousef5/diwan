// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { guestChannels, NOTIFY_CLICK } from '../../src/shared/ipc'

const electron = vi.hoisted(() => {
  const listeners = new Map<string, (...a: unknown[]) => void>()
  return {
    listeners,
    contextBridge: { exposeInMainWorld: vi.fn(), executeInMainWorld: vi.fn() },
    ipcRenderer: {
      send: vi.fn(),
      on: vi.fn((ch: string, fn: (...a: unknown[]) => void) => listeners.set(ch, fn)),
    },
  }
})
vi.mock('electron', () => ({ contextBridge: electron.contextBridge, ipcRenderer: electron.ipcRenderer }))
const findAvatarDataUrl = vi.hoisted(() => vi.fn(async (): Promise<string | null> => null))
vi.mock('../../src/preload/avatar', () => ({ findAvatarDataUrl }))

import { installNotificationShim } from '../../src/preload/notification-shim'

type Bridge = { show(p: unknown): void; close(nid: unknown): void }
let bridge: Bridge
const sent = (channel: string) =>
  electron.ipcRenderer.send.mock.calls.filter(([c]) => c === channel).map(([, p]) => p)

beforeAll(async () => {
  vi.useFakeTimers()
  await import('../../src/preload/guest')
  bridge = electron.contextBridge.exposeInMainWorld.mock.calls[0]?.[1] as Bridge
})
beforeEach(() => electron.ipcRenderer.send.mockClear())

describe('guest preload', () => {
  test('exposes the notify bridge, then installs the shim in the main world', () => {
    expect(electron.contextBridge.exposeInMainWorld).toHaveBeenCalledOnce()
    expect(electron.contextBridge.exposeInMainWorld.mock.calls[0]?.[0]).toBe('__diwanNotify')
    expect(Object.keys(bridge).sort()).toEqual(['close', 'show'])
    expect(electron.contextBridge.executeInMainWorld).toHaveBeenCalledWith({ func: installNotificationShim })
    expect(electron.contextBridge.exposeInMainWorld.mock.invocationCallOrder[0]).toBeLessThan(
      electron.contextBridge.executeInMainWorld.mock.invocationCallOrder[0] ?? 0,
    )
  })

  test('show and close send payloads main accepts', () => {
    const payload = { nid: 'abc-1', title: 'Ali', body: 'hi', tag: 't', icon: '', silent: false }
    bridge.show(payload)
    bridge.close('abc-1')
    expect(sent('guest:notify')).toEqual([payload])
    expect(sent('guest:notify-close')).toEqual([{ nid: 'abc-1' }])
    expect(guestChannels['guest:notify'].safeParse(sent('guest:notify')[0]).success).toBe(true)
    expect(guestChannels['guest:notify-close'].safeParse(sent('guest:notify-close')[0]).success).toBe(true)
  })

  test('close never stringifies page objects and caps the nid', () => {
    const hostile = { toString: () => 'x'.repeat(1_000_000) }
    bridge.close(hostile)
    bridge.close(42)
    bridge.close('y'.repeat(5000))
    expect(sent('guest:notify-close')).toEqual([{ nid: '' }, { nid: '' }, { nid: 'y'.repeat(64) }])
  })

  test('a click from main replays the notification in the main world', () => {
    const onClick = electron.listeners.get(NOTIFY_CLICK)
    expect(onClick).toBeTypeOf('function')
    electron.contextBridge.executeInMainWorld.mockClear()
    onClick?.({}, { nid: 'abc-1' })
    const call = electron.contextBridge.executeInMainWorld.mock.calls[0]?.[0] as {
      func: (nid: string) => void
      args: unknown[]
    }
    expect(call.args).toEqual(['abc-1'])
    const click = vi.fn()
    ;(window as unknown as { __diwanClick?: (n: string) => void }).__diwanClick = click
    call.func('abc-1')
    expect(click).toHaveBeenCalledWith('abc-1')
  })

  test('a malformed click message is ignored', () => {
    electron.contextBridge.executeInMainWorld.mockClear()
    electron.listeners.get(NOTIFY_CLICK)?.({}, { nid: '"); evil(); ("' })
    electron.listeners.get(NOTIFY_CLICK)?.({}, null)
    expect(electron.contextBridge.executeInMainWorld).not.toHaveBeenCalled()
  })

  test('reports going offline and back online', () => {
    const onLine = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false)
    window.dispatchEvent(new Event('offline'))
    onLine.mockReturnValue(true)
    window.dispatchEvent(new Event('online'))
    expect(sent('guest:online')).toEqual([{ online: false }, { online: true }])
    for (const p of sent('guest:online'))
      expect(guestChannels['guest:online'].safeParse(p).success).toBe(true)
    onLine.mockRestore()
  })

  test('looks for the avatar after the page loaded, with retries, and sends it once', async () => {
    const png = 'data:image/png;base64,iVBORw0KGgo='
    findAvatarDataUrl.mockResolvedValueOnce(null).mockResolvedValueOnce(png)
    window.dispatchEvent(new Event('DOMContentLoaded'))
    await vi.advanceTimersByTimeAsync(4000)
    expect(findAvatarDataUrl).toHaveBeenCalledTimes(1)
    expect(sent('guest:avatar')).toEqual([])
    await vi.advanceTimersByTimeAsync(6000)
    expect(findAvatarDataUrl).toHaveBeenCalledTimes(2)
    expect(findAvatarDataUrl).toHaveBeenLastCalledWith(document)
    expect(sent('guest:avatar')).toEqual([{ dataUrl: png }])
    await vi.advanceTimersByTimeAsync(600_000)
    expect(findAvatarDataUrl).toHaveBeenCalledTimes(2)
  })
})
