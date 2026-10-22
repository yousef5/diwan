import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { watchHang } from '../../src/main/watchdog'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

test('calls onHung only if still unresponsive after the grace period', () => {
  const wc = new EventEmitter()
  const onHung = vi.fn()
  watchHang(wc, onHung, 10_000)
  wc.emit('unresponsive')
  vi.advanceTimersByTime(5_000)
  wc.emit('responsive')
  vi.advanceTimersByTime(10_000)
  expect(onHung).not.toHaveBeenCalled()
  wc.emit('unresponsive')
  wc.emit('unresponsive')
  vi.advanceTimersByTime(10_000)
  expect(onHung).toHaveBeenCalledOnce()
})

test('destroyed clears the timer', () => {
  const wc = new EventEmitter()
  const onHung = vi.fn()
  watchHang(wc, onHung, 1_000)
  wc.emit('unresponsive')
  wc.emit('destroyed')
  vi.advanceTimersByTime(2_000)
  expect(onHung).not.toHaveBeenCalled()
})
