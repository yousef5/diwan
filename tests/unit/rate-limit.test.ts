import { afterEach, expect, test, vi } from 'vitest'
import { createRateLimiter } from '../../src/main/rate-limit'

afterEach(() => vi.useRealTimers())

test('allows max hits per window per key, then recovers', () => {
  let now = 0
  const allow = createRateLimiter(3, 10_000, () => now)
  expect([allow('a'), allow('a'), allow('a'), allow('a')]).toEqual([true, true, true, false])
  expect(allow('b')).toBe(true)
  now = 10_001
  expect(allow('a')).toBe(true)
})

test('after a 1 h backward wall-clock step the limiter reopens when the window ends', () => {
  vi.useFakeTimers()
  const allow = createRateLimiter(1, 60_000)
  expect(allow('a')).toBe(true)
  expect(allow('a')).toBe(false)
  vi.setSystemTime(Date.now() - 3_600_000)
  vi.advanceTimersByTime(59_999)
  expect(allow('a')).toBe(false)
  vi.advanceTimersByTime(1)
  expect(allow('a')).toBe(true)
})

test('an injected clock that jumps back reopens the limiter instead of freezing it', () => {
  let now = 3_600_000
  const allow = createRateLimiter(1, 60_000, () => now)
  expect(allow('a')).toBe(true)
  expect(allow('a')).toBe(false)
  now = 0
  expect(allow('a')).toBe(true)
  expect(allow('a')).toBe(false)
})
