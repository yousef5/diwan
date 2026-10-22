import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createOnlineSync } from '../../src/main/guest-online'
import type { ViewState } from '../../src/shared/types'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function setup(initial: ViewState = 'offline') {
  let state = initial
  let guest = true
  const reloads = vi.fn()
  const sync = createOnlineSync({
    getState: () => state,
    setState: (_id, s) => {
      state = s
    },
    hasGuest: () => guest,
    reloadGuest: () => {
      reloads()
      return true
    },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  })
  return { sync, reloads, state: () => state, dropGuest: () => (guest = false) }
}

test('a reload refused by the window is retried once when the window ends', () => {
  const { sync, reloads, state } = setup()
  sync.report('a', true)
  vi.advanceTimersByTime(1000)
  expect(reloads).toHaveBeenCalledTimes(1)
  expect(state()).toBe('loading')
  sync.report('a', false) // flap
  vi.advanceTimersByTime(1000)
  expect(state()).toBe('offline')
  sync.report('a', true)
  vi.advanceTimersByTime(1000)
  expect(reloads).toHaveBeenCalledTimes(1) // refused inside the 10 s window
  sync.report('a', false)
  vi.advanceTimersByTime(1000)
  sync.report('a', true)
  vi.advanceTimersByTime(1000) // a second refusal must not stack a timer
  vi.advanceTimersByTime(20_000)
  expect(reloads).toHaveBeenCalledTimes(2)
  vi.advanceTimersByTime(60_000)
  expect(reloads).toHaveBeenCalledTimes(2)
})

test('the retry does nothing when the account recovered or the guest is gone', () => {
  const a = setup()
  a.sync.report('a', true)
  vi.advanceTimersByTime(1000)
  a.sync.report('a', false)
  vi.advanceTimersByTime(1000)
  a.sync.report('a', true)
  vi.advanceTimersByTime(1000)
  a.dropGuest()
  vi.advanceTimersByTime(20_000)
  expect(a.reloads).toHaveBeenCalledTimes(1)
})

test('a backward wall-clock step does not stretch the reload window', () => {
  const { sync, reloads } = setup()
  sync.report('a', true)
  vi.advanceTimersByTime(1000)
  expect(reloads).toHaveBeenCalledTimes(1)
  sync.report('a', false)
  vi.advanceTimersByTime(1000)
  vi.setSystemTime(Date.now() - 3_600_000)
  sync.report('a', true)
  vi.advanceTimersByTime(20_000) // well past the 10 s window, but not past the 1 h step
  expect(reloads).toHaveBeenCalledTimes(2)
})
