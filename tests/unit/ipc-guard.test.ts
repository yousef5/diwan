import { describe, expect, test, vi } from 'vitest'
import { z } from 'zod'
import { guardGuest, guardShell } from '../../src/main/ipc-guard'

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
