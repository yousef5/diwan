import { describe, expect, test } from 'vitest'
import { formatNotification, shouldNotify } from '../../src/main/notify-rules'

const I = (t: string) => `\u2068${t}\u2069`
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
    ).toEqual({ title: `${I('Work')} · ${I('Ali')}`, body: 'hello' })
  })
  test('preview off hides sender and text', () => {
    expect(
      formatNotification({ accountName: 'Work', title: 'Ali', body: 'hello', showPreview: false }),
    ).toEqual({ title: I('Work'), body: 'New message' })
  })
  test('empty sender falls back', () => {
    expect(formatNotification({ accountName: 'Work', title: '  ', body: 'x', showPreview: true }).title).toBe(
      `${I('Work')} · ${I('WhatsApp')}`,
    )
  })

  test('preview off leaks neither sender nor text', () => {
    const r = formatNotification({
      accountName: 'Work',
      title: 'Secret Sender',
      body: 'secret text',
      showPreview: false,
    })
    expect(r.title).not.toContain('Secret Sender')
    expect(r.body).not.toContain('secret text')
  })
  test('Arabic account with Latin sender is isolated', () => {
    const r = formatNotification({ accountName: 'العمل', title: 'Ali', body: 'x', showPreview: true })
    expect(r.title).toBe(`${I('العمل')} · ${I('Ali')}`)
  })
  test('long body is cut to 200', () => {
    const r = formatNotification({
      accountName: 'Work',
      title: 'Ali',
      body: 'a'.repeat(300),
      showPreview: true,
    })
    expect(r.body).toHaveLength(200)
  })
  test('whitespace in body is collapsed', () => {
    const r = formatNotification({ accountName: 'Work', title: 'Ali', body: 'a\n\nb', showPreview: true })
    expect(r.body).toBe('a b')
  })
  test('empty or blank body falls back', () => {
    for (const body of ['', '  \n ']) {
      expect(formatNotification({ accountName: 'Work', title: 'Ali', body, showPreview: true }).body).toBe(
        'New message',
      )
    }
  })
  test('blank account name falls back', () => {
    const r = formatNotification({ accountName: '  ', title: 'Ali', body: 'x', showPreview: false })
    expect(r.title).toBe(I('WhatsApp'))
  })
})

describe('shouldNotify edge cases', () => {
  test('focused with no active account → yes', () =>
    expect(shouldNotify({ ...base, windowFocused: true, activeId: null })).toBe(true))
  test('disabled and muted → no', () =>
    expect(shouldNotify({ ...base, enabled: false, muted: true })).toBe(false))
})
