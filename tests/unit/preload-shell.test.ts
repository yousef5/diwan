import { beforeAll, describe, expect, test, vi } from 'vitest'
import type { DiwanApi } from '../../src/shared/api'
import { SHELL_COMMAND, STATE_CHANGED } from '../../src/shared/ipc'

const electron = vi.hoisted(() => {
  const listeners = new Map<string, Set<(...a: unknown[]) => void>>()
  return {
    listeners,
    contextBridge: { exposeInMainWorld: vi.fn() },
    ipcRenderer: {
      invoke: vi.fn(async () => 'result'),
      on: vi.fn((ch: string, fn: (...a: unknown[]) => void) => {
        if (!listeners.has(ch)) listeners.set(ch, new Set())
        listeners.get(ch)?.add(fn)
      }),
      off: vi.fn((ch: string, fn: (...a: unknown[]) => void) => {
        listeners.get(ch)?.delete(fn)
      }),
    },
  }
})
vi.mock('electron', () => ({ contextBridge: electron.contextBridge, ipcRenderer: electron.ipcRenderer }))

const emit = (ch: string, value: unknown) => {
  for (const fn of electron.listeners.get(ch) ?? []) fn({ sender: 'the ipcRenderer' }, value)
}

let api: DiwanApi
beforeAll(async () => {
  await import('../../src/preload/shell')
  const [key, exposed] = electron.contextBridge.exposeInMainWorld.mock.calls[0] ?? []
  expect(key).toBe('diwan')
  api = exposed as DiwanApi
})

describe('shell preload', () => {
  test('exposes only invoke/onState/onCommand as window.diwan', () => {
    expect(electron.contextBridge.exposeInMainWorld).toHaveBeenCalledOnce()
    expect(Object.keys(api).sort()).toEqual(['invoke', 'onCommand', 'onState'])
  })

  test('invoke forwards channel and payload', async () => {
    await expect(api.invoke('account:activate', { id: 'x' })).resolves.toBe('result')
    expect(electron.ipcRenderer.invoke).toHaveBeenLastCalledWith('account:activate', { id: 'x' })
    await api.invoke('state:get')
    expect(electron.ipcRenderer.invoke).toHaveBeenLastCalledWith('state:get', undefined)
  })

  test('onState delivers snapshots without the event, and unsubscribes', () => {
    const cb = vi.fn()
    const off = api.onState(cb)
    emit(STATE_CHANGED, { accounts: [] })
    expect(cb).toHaveBeenCalledWith({ accounts: [] })
    expect(cb.mock.calls[0]).toHaveLength(1)
    off()
    emit(STATE_CHANGED, { accounts: [1] })
    expect(cb).toHaveBeenCalledOnce()
  })

  test('onCommand delivers commands without the event, and unsubscribes', () => {
    const cb = vi.fn()
    const off = api.onCommand(cb)
    emit(SHELL_COMMAND, { type: 'openSettings' })
    emit(STATE_CHANGED, { accounts: [] })
    expect(cb).toHaveBeenCalledExactlyOnceWith({ type: 'openSettings' })
    off()
    emit(SHELL_COMMAND, { type: 'openSettings' })
    expect(cb).toHaveBeenCalledOnce()
  })
})
