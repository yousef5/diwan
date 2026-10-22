import { describe, expect, test } from 'vitest'
import { guestChannels, shellChannels } from '../../src/shared/ipc'

describe('shell channels', () => {
  test('account:add validates name and colour', () => {
    expect(shellChannels['account:add'].safeParse({ name: ' Work ', color: '#14b8a6' }).data).toEqual({
      name: 'Work',
      color: '#14b8a6',
    })
    expect(shellChannels['account:add'].safeParse({ name: '', color: '#14b8a6' }).success).toBe(false)
    expect(shellChannels['account:add'].safeParse({ name: 'x', color: 'red' }).success).toBe(false)
  })
  test('settings:update accepts a partial nested patch only', () => {
    expect(shellChannels['settings:update'].safeParse({ notifications: { sound: false } }).success).toBe(true)
    expect(shellChannels['settings:update'].safeParse({ window: { maximized: true } }).success).toBe(false)
  })
  test('tray:setBadges accepts only PNG data URLs', () => {
    expect(shellChannels['tray:setBadges'].safeParse({ none: 'data:image/png;base64,AAAA' }).success).toBe(
      true,
    )
    expect(shellChannels['tray:setBadges'].safeParse({ none: 'https://x/y.png' }).success).toBe(false)
  })
  test('no-payload channels accept undefined', () => {
    expect(shellChannels['state:get'].safeParse(undefined).success).toBe(true)
  })
})

describe('guest channels', () => {
  test('notify payload is bounded', () => {
    const ok = { nid: 'n1', title: 'Ali', body: 'hi', tag: '', icon: '', silent: false }
    expect(guestChannels['guest:notify'].safeParse(ok).success).toBe(true)
    expect(guestChannels['guest:notify'].safeParse({ ...ok, body: 'x'.repeat(5000) }).success).toBe(false)
    expect(guestChannels['guest:notify'].safeParse({ ...ok, icon: 'javascript:1' }).success).toBe(false)
  })
  test('avatar must be an image data URL', () => {
    expect(guestChannels['guest:avatar'].safeParse({ dataUrl: 'data:image/jpeg;base64,AA' }).success).toBe(
      true,
    )
    expect(guestChannels['guest:avatar'].safeParse({ dataUrl: 'data:text/html,<b>' }).success).toBe(false)
  })
})
