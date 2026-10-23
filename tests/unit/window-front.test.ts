import { expect, test, vi } from 'vitest'
import { bringToFront } from '../../src/main/window-front'

function fakeWin(minimized = false) {
  const calls: string[] = []
  let top = false
  return {
    calls,
    isMinimized: () => minimized,
    restore: () => calls.push('restore'),
    show: () => calls.push('show'),
    focus: () => calls.push('focus'),
    setAlwaysOnTop: (f: boolean) => {
      top = f
      calls.push(`top ${f}`)
    },
    isAlwaysOnTop: () => top,
  }
}

test('Windows: restored, shown, raised above the foreground app and focused', () => {
  const w = fakeWin(true)
  const focusApp = vi.fn()
  bringToFront(w, 'win32', focusApp)
  expect(w.calls).toEqual(['restore', 'show', 'top true', 'focus', 'top false'])
  expect(focusApp).toHaveBeenCalledOnce()
})

test('Linux: shown and focused, no always-on-top dance', () => {
  const w = fakeWin()
  const focusApp = vi.fn()
  bringToFront(w, 'linux', focusApp)
  expect(w.calls).toEqual(['show', 'focus'])
  expect(focusApp).not.toHaveBeenCalled()
})

test('Windows: a throwing focus() never leaves the window always-on-top', () => {
  const w = fakeWin()
  w.focus = () => {
    w.calls.push('focus')
    throw new Error('gone')
  }
  expect(() => bringToFront(w, 'win32', vi.fn())).toThrow('gone')
  expect(w.calls).toEqual(['show', 'top true', 'focus', 'top false'])
  expect(w.isAlwaysOnTop()).toBe(false)
})
