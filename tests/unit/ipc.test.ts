import { describe, expect, test, vi } from 'vitest'
import * as dims from '../../src/shared/image-dims'
import { guestChannels, shellChannels } from '../../src/shared/ipc'
import { jpegHeader, PNG_1x1, pngHeader, url, webpVp8l } from './helpers/images'

const ID = '123e4567-e89b-42d3-a456-426614174000'
const OK_PNG = `data:image/png;base64,${PNG_1x1}`

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
    const b = (v: unknown) => shellChannels['tray:setBadges'].safeParse(v).success
    expect(b({ none: OK_PNG })).toBe(true)
    expect(b({ evil: OK_PNG })).toBe(false)
    expect(b({ none: url('png', pngHeader(65, 1)) })).toBe(false)
    expect(b({ none: 'data:image/png;base64,AAAA' })).toBe(false)
    expect(shellChannels['tray:setBadges'].safeParse({ none: 'https://x/y.png' }).success).toBe(false)
  })
  test('taskbar:setBadges takes 16 px PNGs for 1–9 and 9+ only', () => {
    const b = (v: unknown) => shellChannels['taskbar:setBadges'].safeParse(v).success
    expect(b({ 3: OK_PNG, '9+': url('png', pngHeader(16, 16)) })).toBe(true)
    expect(b({ none: OK_PNG })).toBe(false)
    expect(b({ 10: OK_PNG })).toBe(false)
    expect(b({ 1: url('png', pngHeader(17, 16)) })).toBe(false)
    expect(b({ 1: url('jpeg', jpegHeader(16, 16)) })).toBe(false)
  })
  test('protocol:setWhatsapp takes a boolean only', () => {
    const p = (v: unknown) => shellChannels['protocol:setWhatsapp'].safeParse(v).success
    expect(p({ enabled: true })).toBe(true)
    expect(p({ enabled: 'yes' })).toBe(false)
    expect(p(undefined)).toBe(false)
  })
  test('account:update patch is strict and non-empty', () => {
    const p = (patch: unknown) => shellChannels['account:update'].safeParse({ id: ID, patch }).success
    expect(p({})).toBe(false)
    expect(p({ name: undefined })).toBe(false)
    expect(p({ zoom: 1 })).toBe(false)
    expect(p({ name: 'a' })).toBe(true)
    expect(p({ name: '\u200b\u200b' })).toBe(false)
  })
  test('account:update rejects non-canonical ids', () => {
    expect(
      shellChannels['account:update'].safeParse({ id: '-'.repeat(36), patch: { name: 'a' } }).success,
    ).toBe(false)
  })
  test('settings:update needs a defined value', () => {
    expect(shellChannels['settings:update'].safeParse({}).success).toBe(false)
    expect(shellChannels['settings:update'].safeParse({ notifications: {} }).success).toBe(false)
    expect(shellChannels['settings:update'].safeParse({ closeToTray: undefined }).success).toBe(false)
    expect(shellChannels['settings:update'].safeParse({ closeToTray: false }).success).toBe(true)
  })
  test('account:reorder rejects duplicates, allows empty', () => {
    expect(shellChannels['account:reorder'].safeParse({ ids: [ID, ID] }).success).toBe(false)
    expect(shellChannels['account:reorder'].safeParse({ ids: [] }).success).toBe(true)
  })
  test('account:zoom delta is -1, 0 or 1', () => {
    expect(shellChannels['account:zoom'].safeParse({ id: ID, delta: -1 }).success).toBe(true)
    expect(shellChannels['account:zoom'].safeParse({ id: ID, delta: 2 }).success).toBe(false)
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
    const a = (dataUrl: string) => guestChannels['guest:avatar'].safeParse({ dataUrl }).success
    expect(a(url('jpeg', jpegHeader(100, 100)))).toBe(true)
    expect(a(OK_PNG)).toBe(true)
    expect(a(url('webp', webpVp8l(300, 200)))).toBe(false)
    expect(a(url('jpeg', jpegHeader(5000, 5000)))).toBe(false)
    expect(a(url('png', pngHeader(30000, 30000)))).toBe(false)
    expect(a(`data:image/png;base64,${btoa('hello')}`)).toBe(false)
    expect(a('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false)
    expect(a('data:image/gif;base64,R0lGODlhAQABAAAAACw=')).toBe(false)
    expect(a('data:image/jpeg;base64,AA')).toBe(false)
    expect(guestChannels['guest:avatar'].safeParse({ dataUrl: 'data:text/html,<b>' }).success).toBe(false)
  })
  test('notify icon is dimension-capped', () => {
    const ok = { nid: 'n1', title: 'a', body: 'b', tag: '', icon: OK_PNG, silent: false }
    expect(guestChannels['guest:notify'].safeParse(ok).success).toBe(true)
    expect(
      guestChannels['guest:notify'].safeParse({ ...ok, icon: url('png', pngHeader(513, 1)) }).success,
    ).toBe(false)
  })
  test('nid charset', () => {
    const n = (nid: string) => guestChannels['guest:notify-close'].safeParse({ nid }).success
    expect(n('__proto__')).toBe(true)
    expect(n('a b')).toBe(false)
    expect(n('x\n')).toBe(false)
    expect(n('')).toBe(false)
  })
  test('guest:online is boolean only', () => {
    expect(guestChannels['guest:online'].safeParse({ online: true }).success).toBe(true)
    expect(guestChannels['guest:online'].safeParse({ online: 'yes' }).success).toBe(false)
  })
})

describe('review round 3', () => {
  const ID2 = '123e4567-e89b-42d3-a456-426614174000'
  test('undefined keys are dropped from patches', () => {
    const r = shellChannels['account:update'].safeParse({ id: ID2, patch: { name: 'a', color: undefined } })
    expect(Object.keys(r.data?.patch ?? {})).toEqual(['name'])
    const s = shellChannels['settings:update'].safeParse({
      closeToTray: false,
      startHidden: undefined,
      notifications: { sound: true, enabled: undefined },
    })
    expect(Object.keys(s.data ?? {}).sort()).toEqual(['closeToTray', 'notifications'])
    expect(Object.keys(s.data?.notifications ?? {})).toEqual(['sound'])
  })
  test('oversize strings abort before expensive refine', () => {
    const spy = vi.spyOn(dims, 'dataUrlDims')
    const big = `data:image/png;base64,${'A'.repeat(50_000_000)}`
    const t = performance.now()
    expect(guestChannels['guest:avatar'].safeParse({ dataUrl: big }).success).toBe(false)
    expect(performance.now() - t).toBeLessThan(50)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
  test('webp is not accepted', () => {
    expect(guestChannels['guest:avatar'].safeParse({ dataUrl: url('webp', webpVp8l(10, 10)) }).success).toBe(
      false,
    )
  })
  test('jpeg SOF9 is parsed and capped', () => {
    const b = jpegHeader(65535, 65535)
    b[9] = 0xc9
    expect(dims.imageDims(b)).toEqual({ width: 65535, height: 65535 })
    expect(guestChannels['guest:avatar'].safeParse({ dataUrl: url('jpeg', b) }).success).toBe(false)
  })
})
