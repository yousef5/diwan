import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  AVATAR_FIRST_MS,
  AVATAR_MAX_MS,
  avatarRetryDelay,
  clickNid,
  tokenBucket,
  watchAvatar,
} from '../../src/preload/guest-logic'

describe('avatarRetryDelay', () => {
  test('doubles from 6 s and caps at a minute', () => {
    expect([1, 2, 3, 4, 5, 6, 50].map(avatarRetryDelay)).toEqual([
      6000, 12_000, 24_000, 48_000, 60_000, 60_000, 60_000,
    ])
  })
  test('never returns less than the first retry', () => {
    expect(avatarRetryDelay(0)).toBe(6000)
    expect(avatarRetryDelay(-3)).toBe(6000)
  })
})

describe('watchAvatar', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  test('waits for the page before the first look, then sends once and stops', async () => {
    const find = vi.fn().mockResolvedValue('data:image/png;base64,AAA')
    const send = vi.fn()
    watchAvatar(find, send)
    await vi.advanceTimersByTimeAsync(AVATAR_FIRST_MS - 1)
    expect(find).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(find).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith('data:image/png;base64,AAA')
    await vi.advanceTimersByTimeAsync(10 * AVATAR_MAX_MS)
    expect(find).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledTimes(1)
  })

  test('retries with backoff until a picture shows up', async () => {
    const find = vi.fn().mockResolvedValue(null)
    const send = vi.fn()
    watchAvatar(find, send)
    const at: number[] = []
    find.mockImplementation(async () => {
      at.push(Date.now())
      return at.length === 7 ? 'data:image/png;base64,BBB' : null
    })
    const start = Date.now()
    await vi.advanceTimersByTimeAsync(4000 + 6000 + 12_000 + 24_000 + 48_000 + 60_000 + 60_000)
    expect(at.map((t) => t - start)).toEqual([4000, 10_000, 22_000, 46_000, 94_000, 154_000, 214_000])
    expect(send).toHaveBeenCalledOnce()
    expect(send).toHaveBeenCalledWith('data:image/png;base64,BBB')
  })

  test('a lookup that throws counts as not found', async () => {
    const find = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue('data:image/png;base64,C')
    const send = vi.fn()
    watchAvatar(find, send)
    await vi.advanceTimersByTimeAsync(AVATAR_FIRST_MS)
    expect(send).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(6000)
    expect(send).toHaveBeenCalledWith('data:image/png;base64,C')
  })

  test('lookups never overlap: the next one waits for a slow one to settle', async () => {
    let resolve: (v: string | null) => void = () => {}
    const find = vi.fn(() => new Promise<string | null>((r) => (resolve = r)))
    watchAvatar(find, vi.fn())
    await vi.advanceTimersByTimeAsync(AVATAR_FIRST_MS + 30_000)
    expect(find).toHaveBeenCalledTimes(1)
    resolve(null)
    await vi.advanceTimersByTimeAsync(5999)
    expect(find).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(find).toHaveBeenCalledTimes(2)
  })

  test('stop cancels the pending look and drops a lookup still in flight', async () => {
    let resolve: (v: string | null) => void = () => {}
    const find = vi.fn(() => new Promise<string | null>((r) => (resolve = r)))
    const send = vi.fn()
    const stop = watchAvatar(find, send)
    await vi.advanceTimersByTimeAsync(AVATAR_FIRST_MS)
    stop()
    resolve('data:image/png;base64,D')
    await vi.advanceTimersByTimeAsync(10 * AVATAR_MAX_MS)
    expect(send).not.toHaveBeenCalled()
    expect(find).toHaveBeenCalledTimes(1)

    const find2 = vi.fn().mockResolvedValue(null)
    watchAvatar(find2, send)()
    await vi.advanceTimersByTimeAsync(10 * AVATAR_MAX_MS)
    expect(find2).not.toHaveBeenCalled()
  })
})

describe('clickNid', () => {
  test('accepts a well-formed nid', () => {
    expect(clickNid({ nid: 'k3j9x2ab-12' })).toBe('k3j9x2ab-12')
  })
  test.each([
    null,
    undefined,
    'abc',
    {},
    { nid: 5 },
    { nid: '' },
    { nid: 'a b' },
    { nid: 'x'.repeat(65) },
    { nid: '"); alert(1); ("' },
  ])('rejects %j', (msg) => {
    expect(clickNid(msg)).toBeNull()
  })
})

describe('tokenBucket', () => {
  afterEach(() => vi.useRealTimers())
  const take = (allow: () => boolean, n: number) => Array.from({ length: n }, allow).filter(Boolean).length

  test('a full bucket allows a burst of capacity, then drops', () => {
    vi.useFakeTimers()
    const allow = tokenBucket(60, 10_000)
    expect(take(allow, 100_000)).toBe(60)
  })

  test('refills smoothly at capacity per window', () => {
    vi.useFakeTimers()
    const allow = tokenBucket(60, 10_000)
    take(allow, 60)
    vi.advanceTimersByTime(166) // 0.996 of a token
    expect(allow()).toBe(false)
    vi.advanceTimersByTime(1)
    expect(allow()).toBe(true)
    vi.advanceTimersByTime(5000)
    expect(take(allow, 1000)).toBe(30)
  })

  test('never holds more than its capacity, however long it sat idle', () => {
    vi.useFakeTimers()
    const allow = tokenBucket(400, 10_000)
    vi.advanceTimersByTime(3_600_000)
    expect(take(allow, 10_000)).toBe(400)
  })

  test('a sustained loop gets exactly the refill rate', () => {
    let t = 0
    const allow = tokenBucket(60, 10_000, () => t)
    let ok = 0
    for (; t < 60_000; t += 1) ok += take(allow, 10)
    expect(ok).toBeGreaterThanOrEqual(60 + 6 * 60 - 1)
    expect(ok).toBeLessThanOrEqual(60 + 6 * 60)
  })

  test('a clock going backwards does not drain or overfill it', () => {
    let t = 1_000_000
    const allow = tokenBucket(5, 10_000, () => t)
    expect(take(allow, 3)).toBe(3)
    t -= 500_000
    expect(take(allow, 10)).toBe(2)
  })
})
