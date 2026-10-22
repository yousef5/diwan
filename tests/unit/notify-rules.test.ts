import { describe, expect, test } from 'vitest'
import { formatNotification, shouldNotify } from '../../src/main/notify-rules'

const base = { enabled: true, muted: false, windowFocused: false, activeId: 'a', accountId: 'a' }

describe('shouldNotify', () => {
  test('background window → yes', () => expect(shouldNotify(base)).toBe(true))
  test('globally off → no', () => expect(shouldNotify({ ...base, enabled: false })).toBe(false))
  test('account muted → no', () => expect(shouldNotify({ ...base, muted: true })).toBe(false))
  test('focused on that same account → no', () =>
    expect(shouldNotify({ ...base, windowFocused: true })).toBe(false))
  test('focused on another account → yes', () =>
    expect(shouldNotify({ ...base, windowFocused: true, activeId: 'b' })).toBe(true))
})

describe('formatNotification', () => {
  test('names the account and the sender', () => {
    expect(
      formatNotification({ accountName: 'Work', title: 'Ali', body: 'hello', showPreview: true }),
    ).toEqual({ title: 'Work · Ali', body: 'hello' })
  })
  test('preview off hides sender and text', () => {
    expect(
      formatNotification({ accountName: 'Work', title: 'Ali', body: 'hello', showPreview: false }),
    ).toEqual({ title: 'Work', body: 'New message' })
  })
  test('empty sender falls back', () => {
    expect(formatNotification({ accountName: 'Work', title: '  ', body: 'x', showPreview: true }).title).toBe(
      'Work · WhatsApp',
    )
  })
})
