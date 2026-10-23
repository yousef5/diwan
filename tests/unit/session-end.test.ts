import { EventEmitter } from 'node:events'
import { describe, expect, test, vi } from 'vitest'
import { wireSessionEnd } from '../../src/main/session-end'

function setup(platform: NodeJS.Platform) {
  const win = new EventEmitter()
  const powerMonitor = new EventEmitter()
  const onQuery = vi.fn()
  const onEnd = vi.fn()
  wireSessionEnd({ platform, win, powerMonitor, onQuery, onEnd })
  return { win, powerMonitor, onQuery, onEnd }
}

describe('wireSessionEnd', () => {
  test('win32: a logoff query only saves; the session end itself ends', () => {
    const { win, powerMonitor, onQuery, onEnd } = setup('win32')
    win.emit('query-session-end', {})
    expect(onQuery).toHaveBeenCalledTimes(1)
    expect(onEnd).not.toHaveBeenCalled()
    win.emit('session-end', {})
    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(onQuery).toHaveBeenCalledTimes(1)
    powerMonitor.emit('shutdown', {})
    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  test('win32: a cancelled logoff (query, no end) never marks the app as quitting', () => {
    let quitting = false
    let saves = 0
    const win = new EventEmitter()
    wireSessionEnd({
      platform: 'win32',
      win,
      powerMonitor: new EventEmitter(),
      onQuery: () => {
        saves++
      },
      onEnd: () => {
        quitting = true
        saves++
      },
    })
    win.emit('query-session-end', {})
    expect(saves).toBe(1)
    expect(quitting).toBe(false)
  })

  test('linux: powerMonitor shutdown ends the session', () => {
    const { win, powerMonitor, onQuery, onEnd } = setup('linux')
    powerMonitor.emit('shutdown', {})
    expect(onEnd).toHaveBeenCalledTimes(1)
    win.emit('query-session-end', {})
    win.emit('session-end', {})
    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(onQuery).not.toHaveBeenCalled()
  })

  test('a throwing handler never escapes into the event', () => {
    const win = new EventEmitter()
    const boom = () => {
      throw new Error('x')
    }
    wireSessionEnd({ platform: 'win32', win, powerMonitor: new EventEmitter(), onQuery: boom, onEnd: boom })
    expect(() => win.emit('query-session-end', {})).not.toThrow()
    expect(() => win.emit('session-end', {})).not.toThrow()
  })
})
