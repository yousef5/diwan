import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { call } from '../../src/renderer/api'
import { useUi } from '../../src/renderer/state'

const initial = useUi.getState()
const invoke = vi.fn()

beforeEach(() => {
  vi.useFakeTimers()
  useUi.setState(initial, true)
  invoke.mockReset()
  vi.stubGlobal('window', { diwan: { invoke } })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('call', () => {
  test('passes channel and payload through and returns the result', async () => {
    invoke.mockResolvedValue({ id: 'a' })
    await expect(call('account:add', { name: 'A', color: '#3b82f6' })).resolves.toEqual({ id: 'a' })
    expect(invoke).toHaveBeenCalledWith('account:add', { name: 'A', color: '#3b82f6' })
    expect(useUi.getState().toasts).toEqual([])
  })

  test('a rejection becomes a toast with the clean message, and resolves undefined', async () => {
    invoke.mockRejectedValue(
      new Error("Error invoking remote method 'importer:apply': Error: Quit Nexus first, then import again."),
    )
    await expect(call('importer:apply')).resolves.toBeUndefined()
    expect(useUi.getState().toasts.map((t) => t.text)).toEqual(['Quit Nexus first, then import again.'])
  })

  test('a failed call is an error toast: it stays until dismissed', async () => {
    invoke.mockRejectedValue(new Error('nope'))
    await call('window:minimize')
    expect(useUi.getState().toasts).toMatchObject([{ text: 'nope', error: true }])
    vi.advanceTimersByTime(60_000)
    expect(useUi.getState().toasts).toHaveLength(1)
  })

  test('a synchronous throw is caught too', async () => {
    invoke.mockImplementation(() => {
      throw new Error('bridge gone')
    })
    await expect(call('window:minimize')).resolves.toBeUndefined()
    expect(useUi.getState().toasts.map((t) => t.text)).toEqual(['bridge gone'])
  })
})

test('vitest defines __APP_VERSION__ like the renderer build does', async () => {
  const pkg = await import('../../package.json')
  expect(__APP_VERSION__).toBe(pkg.version)
})
