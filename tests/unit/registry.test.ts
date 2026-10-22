import type { WebContents } from 'electron'
import { describe, expect, test } from 'vitest'
import { Registry } from '../../src/main/registry'

const fakeWc = (id: number, destroyed = false) =>
  ({ id, isDestroyed: () => destroyed }) as unknown as WebContents

describe('Registry', () => {
  test('maps both ways', () => {
    const r = new Registry()
    const wc = fakeWc(7)
    r.attach(wc, 'acc')
    expect(r.accountOf(7)).toBe('acc')
    expect(r.guestOf('acc')).toBe(wc)
  })
  test('a remount replaces the old guest; detaching the old one keeps the new', () => {
    const r = new Registry()
    r.attach(fakeWc(1), 'acc')
    const newer = fakeWc(2)
    r.attach(newer, 'acc')
    r.detach(1)
    expect(r.accountOf(1)).toBeUndefined()
    expect(r.guestOf('acc')).toBe(newer)
  })
  test('destroyed guests are not returned', () => {
    const r = new Registry()
    r.attach(fakeWc(3, true), 'acc')
    expect(r.guestOf('acc')).toBeUndefined()
  })
  test('detaching an unknown id is a no-op', () => {
    const r = new Registry()
    r.attach(fakeWc(1), 'acc')
    r.detach(99)
    expect(r.accountOf(1)).toBe('acc')
  })
})
