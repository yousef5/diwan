import { describe, expect, test, vi } from 'vitest'
import { retryAsync, retrySync, rmRetryOptions } from '../../src/main/retry-fs'

const err = (code: string) => Object.assign(new Error(code), { code })

// Fails with `codes` in turn, then returns 'ok'.
function flaky(codes: string[]) {
  let i = 0
  return vi.fn(() => {
    const code = codes[i++]
    if (code) throw err(code)
    return 'ok'
  })
}

describe('retrySync', () => {
  test('win32: retries EPERM/EACCES/EBUSY with backoff, then succeeds', () => {
    const fn = flaky(['EPERM', 'EACCES', 'EBUSY'])
    const sleep = vi.fn()
    expect(retrySync(fn, { platform: 'win32', delays: [1, 2, 3, 4], sleep })).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(4)
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1, 2, 3])
  })

  test('win32: gives up after the last delay and rethrows', () => {
    const fn = flaky(['EBUSY', 'EBUSY', 'EBUSY'])
    expect(() => retrySync(fn, { platform: 'win32', delays: [0, 0], sleep: () => {} })).toThrow('EBUSY')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  test('win32: other errors are not retried', () => {
    const fn = flaky(['ENOENT'])
    expect(() => retrySync(fn, { platform: 'win32', delays: [0], sleep: () => {} })).toThrow('ENOENT')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test('linux: never retries', () => {
    const fn = flaky(['EBUSY'])
    expect(() => retrySync(fn, { platform: 'linux', delays: [0], sleep: () => {} })).toThrow('EBUSY')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test('the default sleep really waits', () => {
    const fn = flaky(['EPERM'])
    const t = performance.now()
    expect(retrySync(fn, { platform: 'win32', delays: [20] })).toBe('ok')
    expect(performance.now() - t).toBeGreaterThanOrEqual(15)
  })
})

describe('retryAsync', () => {
  test('win32: retries a transient failure', async () => {
    let i = 0
    const fn = vi.fn(async () => {
      if (i++ < 2) throw err('EPERM')
      return 7
    })
    await expect(retryAsync(fn, { platform: 'win32', delays: [0, 0, 0] })).resolves.toBe(7)
    expect(fn).toHaveBeenCalledTimes(3)
  })

  test('linux: the first failure rejects', async () => {
    const fn = vi.fn(async () => {
      throw err('EBUSY')
    })
    await expect(retryAsync(fn, { platform: 'linux', delays: [0] })).rejects.toThrow('EBUSY')
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

test('rm retry options only on win32', () => {
  expect(rmRetryOptions('win32')).toEqual({ maxRetries: 5, retryDelay: 200 })
  expect(rmRetryOptions('linux')).toEqual({})
})
