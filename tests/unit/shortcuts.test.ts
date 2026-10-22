import { describe, expect, test } from 'vitest'
import { type KeyInput, matchShortcut } from '../../src/main/shortcuts'

const key = (code: string, mods: Partial<KeyInput> = {}): KeyInput => ({
  type: 'keyDown',
  code,
  key: '',
  control: true,
  meta: false,
  shift: false,
  alt: false,
  ...mods,
})

describe('matchShortcut', () => {
  test('Ctrl+1…9 pick accounts by code (works on the Arabic layout)', () => {
    expect(matchShortcut(key('Digit1'))).toEqual({ type: 'account', index: 0 })
    expect(matchShortcut(key('Digit9'))).toEqual({ type: 'account', index: 8 })
    expect(matchShortcut(key('Numpad3'))).toEqual({ type: 'account', index: 2 })
  })
  test('next / previous', () => {
    expect(matchShortcut(key('Tab'))).toEqual({ type: 'next' })
    expect(matchShortcut(key('Tab', { shift: true }))).toEqual({ type: 'prev' })
    expect(matchShortcut(key('PageDown'))).toEqual({ type: 'next' })
    expect(matchShortcut(key('PageUp'))).toEqual({ type: 'prev' })
  })
  test('reload, remount, F5', () => {
    expect(matchShortcut(key('KeyR'))).toEqual({ type: 'reload' })
    expect(matchShortcut(key('KeyR', { shift: true }))).toEqual({ type: 'remount' })
    expect(matchShortcut(key('F5', { control: false }))).toEqual({ type: 'reload' })
  })
  test('zoom', () => {
    expect(matchShortcut(key('Equal'))).toEqual({ type: 'zoom', delta: 1 })
    expect(matchShortcut(key('Equal', { shift: true }))).toEqual({ type: 'zoom', delta: 1 })
    expect(matchShortcut(key('Minus'))).toEqual({ type: 'zoom', delta: -1 })
    expect(matchShortcut(key('Digit0'))).toEqual({ type: 'zoom', delta: 0 })
  })
  test('settings, hide, quit', () => {
    expect(matchShortcut(key('Comma'))).toEqual({ type: 'settings' })
    expect(matchShortcut(key('KeyW'))).toEqual({ type: 'hide' })
    expect(matchShortcut(key('KeyQ'))).toEqual({ type: 'quit' })
  })
  test('ignored: keyUp, Alt combos, plain keys, WhatsApp’s own Ctrl+Shift shortcuts', () => {
    expect(matchShortcut(key('Digit1', { type: 'keyUp' }))).toBeNull()
    expect(matchShortcut(key('Digit1', { alt: true }))).toBeNull()
    expect(matchShortcut(key('KeyA', { control: false }))).toBeNull()
    expect(matchShortcut(key('KeyM', { shift: true }))).toBeNull()
    expect(matchShortcut(key('Digit1', { shift: true }))).toBeNull()
  })
})
