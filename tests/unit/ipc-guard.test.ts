import { afterEach, describe, expect, test, vi } from 'vitest'
import { z } from 'zod'
import { guardGuest, guardShell, guestLimits } from '../../src/main/ipc-guard'

const mkLog = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })
type Ev = { sender: { id: number }; main?: boolean }

describe('guardShell', () => {
  const schema = z.object({ n: z.string().transform((s) => s.toUpperCase()) })
  const make = (closed = false) => {
    const log = mkLog()
    const wrap = guardShell<Ev>({
      winWebContentsId: () => (closed ? undefined : 1),
      isMainFrame: (e) => e.main !== false,
      log,
    })
    return { log, wrap }
  }

  test('rejects a wrong sender', async () => {
    const { wrap, log } = make()
    const fn = vi.fn()
    await expect(wrap('c', schema, fn)({ sender: { id: 2 } }, { n: 'a' })).rejects.toThrow('forbidden')
    expect(fn).not.toHaveBeenCalled()
    expect(log.warn).toHaveBeenCalledWith('forbidden shell call', { channel: 'c' })
  })
  test('rejects a sub-frame', async () => {
    const { wrap } = make()
    await expect(wrap('c', schema, vi.fn())({ sender: { id: 1 }, main: false }, { n: 'a' })).rejects.toThrow(
      'forbidden',
    )
  })
  test('rejects when the window is closed', async () => {
    const { wrap } = make(true)
    await expect(wrap('c', schema, vi.fn())({ sender: { id: 1 } }, { n: 'a' })).rejects.toThrow('forbidden')
  })
  test('rejects an invalid payload without calling fn', async () => {
    const { wrap } = make()
    const fn = vi.fn()
    await expect(wrap('c', schema, fn)({ sender: { id: 1 } }, { n: 5 })).rejects.toThrow('invalid payload')
    expect(fn).not.toHaveBeenCalled()
  })
  test('fn receives the transformed output and its result is returned', async () => {
    const { wrap } = make()
    const fn = vi.fn(() => 42)
    await expect(wrap('c', schema, fn)({ sender: { id: 1 } }, { n: 'a' })).resolves.toBe(42)
    expect(fn).toHaveBeenCalledWith({ n: 'A' })
  })
  test('handler errors are logged and rethrown short, without stack', async () => {
    const { wrap, log } = make()
    const long = `${'x'.repeat(300)}\nsecond line`
    const err = await wrap('c', schema, () => {
      throw new Error(long)
    })({ sender: { id: 1 } }, { n: 'a' }).catch((e: Error) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toBe('x'.repeat(200))
    expect((err as Error).stack).toBeUndefined()
    expect(log.error).toHaveBeenCalledWith('c failed', expect.any(Error))
  })
})

describe('guardGuest', () => {
  const schema = z.object({ online: z.boolean() })
  const make = (limits?: Parameters<typeof guardGuest<Ev>>[0]['limits'], wa = true) => {
    const log = mkLog()
    const wrap = guardGuest<Ev>({
      accountOf: (id) => (id === 7 ? 'acc' : undefined),
      isWhatsAppMainFrame: () => wa,
      log,
      limits,
    })
    return { log, wrap }
  }

  test('passes account id and parsed payload', () => {
    const { wrap } = make()
    const fn = vi.fn()
    wrap('guest:online', schema, fn)({ sender: { id: 7 } }, { online: true })
    expect(fn).toHaveBeenCalledWith('acc', { online: true }, { sender: { id: 7 } })
  })
  test('unknown sender is dropped silently', () => {
    const { wrap, log } = make()
    const fn = vi.fn()
    wrap('guest:online', schema, fn)({ sender: { id: 9 } }, { online: true })
    expect(fn).not.toHaveBeenCalled()
    expect(log.warn).not.toHaveBeenCalled()
  })
  test('non-WhatsApp frame is dropped', () => {
    const { wrap } = make(undefined, false)
    const fn = vi.fn()
    wrap('guest:online', schema, fn)({ sender: { id: 7 } }, { online: true })
    expect(fn).not.toHaveBeenCalled()
  })
  test('invalid payload is dropped and logged', () => {
    const { wrap, log } = make()
    const fn = vi.fn()
    wrap('guest:online', schema, fn)({ sender: { id: 7 } }, { online: 'x' })
    expect(fn).not.toHaveBeenCalled()
    expect(log.warn).toHaveBeenCalled()
  })
  test('a throwing fn is caught and logged', () => {
    const { wrap, log } = make()
    expect(() =>
      wrap('guest:online', schema, () => {
        throw new Error('EACCES')
      })({ sender: { id: 7 } }, { online: true }),
    ).not.toThrow()
    expect(log.error).toHaveBeenCalledWith('guest:online failed', expect.any(Error))
  })
  test('a closed limiter stops before safeParse', () => {
    const spy = vi.spyOn(schema, 'safeParse')
    const { wrap } = make({ 'guest:online': () => false })
    const fn = vi.fn()
    wrap('guest:online', schema, fn)({ sender: { id: 7 } }, { online: true })
    expect(spy).not.toHaveBeenCalled()
    expect(fn).not.toHaveBeenCalled()
  })
})

describe('guardGuest invalid-payload logging', () => {
  afterEach(() => vi.useRealTimers())
  const schema = z.object({ online: z.boolean() })

  test('logs once per channel per account per minute', () => {
    vi.useFakeTimers()
    const log = mkLog()
    const wrap = guardGuest<Ev>({
      accountOf: (id) => ({ 7: 'a', 8: 'b' })[id],
      isWhatsAppMainFrame: () => true,
      log,
    })
    const online = wrap('guest:online', schema, vi.fn())
    const close = wrap('guest:notify-close', schema, vi.fn())
    for (let i = 0; i < 1000; i++) online({ sender: { id: 7 } }, {})
    expect(log.warn).toHaveBeenCalledTimes(1)
    online({ sender: { id: 8 } }, {}) // another account
    close({ sender: { id: 7 } }, {}) // another channel
    expect(log.warn).toHaveBeenCalledTimes(3)
    vi.advanceTimersByTime(59_999)
    online({ sender: { id: 7 } }, {})
    expect(log.warn).toHaveBeenCalledTimes(3)
    vi.advanceTimersByTime(1)
    online({ sender: { id: 7 } }, {})
    expect(log.warn).toHaveBeenCalledTimes(4)
  })
})

describe('guestLimits', () => {
  const run = (limit: (k: string) => boolean, key: string, n: number) =>
    Array.from({ length: n }, () => limit(key)).filter(Boolean).length

  test('notify: 30 per 10 s per account; close: 200; avatar: 1 per 30 s', () => {
    let t = 0
    const l = guestLimits(() => t)
    expect(run(l['guest:notify'] as (k: string) => boolean, 'a', 100)).toBe(30)
    expect(run(l['guest:notify'] as (k: string) => boolean, 'b', 100)).toBe(30)
    expect(run(l['guest:notify-close'] as (k: string) => boolean, 'a', 1000)).toBe(200)
    expect(run(l['guest:avatar'] as (k: string) => boolean, 'a', 5)).toBe(1)
    t = 10_000
    expect(run(l['guest:notify'] as (k: string) => boolean, 'a', 100)).toBe(30)
    expect(run(l['guest:avatar'] as (k: string) => boolean, 'a', 5)).toBe(0)
    t = 30_000
    expect(run(l['guest:avatar'] as (k: string) => boolean, 'a', 5)).toBe(1)
    expect(l['guest:online']).toBeUndefined()
  })

  test('a looping page never reaches the parser once the notify limit is spent', () => {
    const notify = z.object({ nid: z.string() })
    const spy = vi.spyOn(notify, 'safeParse')
    const log = mkLog()
    const wrap = guardGuest<Ev>({
      accountOf: () => 'a',
      isWhatsAppMainFrame: () => true,
      log,
      limits: guestLimits(() => 0),
    })
    const h = wrap('guest:notify', notify, vi.fn())
    for (let i = 0; i < 10_000; i++) h({ sender: { id: 1 } }, {})
    expect(spy).toHaveBeenCalledTimes(30)
    expect(log.warn).toHaveBeenCalledTimes(1)
  })
})
