import { expect, test } from 'vitest'
import { createRateLimiter } from '../../src/main/rate-limit'

test('allows max hits per window per key, then recovers', () => {
  let now = 0
  const allow = createRateLimiter(3, 10_000, () => now)
  expect([allow('a'), allow('a'), allow('a'), allow('a')]).toEqual([true, true, true, false])
  expect(allow('b')).toBe(true)
  now = 10_001
  expect(allow('a')).toBe(true)
})
