import { describe, expect, test } from 'vitest'
import type { Account, AccountRuntime } from '../../src/shared/types'
import { BADGE_KEYS, badgeKey, parseUnread, unreadTotal, windowTitle } from '../../src/shared/unread'

const acc = (id: string, muted = false): Account => ({
  id,
  name: id,
  color: '#3b82f6',
  order: 0,
  zoom: 0,
  muted,
  customAvatar: false,
  createdAt: '',
})
const rt = (unread: number): AccountRuntime => ({ state: 'ready', unread, avatar: null })

describe('parseUnread', () => {
  test.each([
    ['(3) WhatsApp', 3],
    ['WhatsApp', 0],
    ['(128) WhatsApp', 128],
    ['(٣) واتساب', 3],
    ['(١٢) واتساب', 12],
    ['(۷) WhatsApp', 7],
    ['', 0],
  ])('%s → %i', (title, n) => {
    expect(parseUnread(title)).toBe(n)
  })
})

describe('totals and badges', () => {
  test('muted accounts do not count', () => {
    expect(unreadTotal([acc('a'), acc('b', true)], { a: rt(2), b: rt(5) })).toBe(2)
  })
  test('missing runtime counts as zero', () => {
    expect(unreadTotal([acc('a')], {})).toBe(0)
  })
  test('badgeKey', () => {
    expect(badgeKey(0)).toBe('none')
    expect(badgeKey(4)).toBe('4')
    expect(badgeKey(10)).toBe('9+')
    expect(BADGE_KEYS).toEqual(['none', '1', '2', '3', '4', '5', '6', '7', '8', '9', '9+'])
  })
  test('windowTitle', () => {
    expect(windowTitle(0)).toBe('Diwan')
    expect(windowTitle(5)).toBe('Diwan (5)')
  })
})
