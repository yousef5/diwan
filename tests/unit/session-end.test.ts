import { EventEmitter } from 'node:events'
import { describe, expect, test, vi } from 'vitest'
import { wireSessionEnd } from '../../src/main/session-end'

function setup(platform: NodeJS.Platform) {
  const win = new EventEmitter()
  const powerMonitor = new EventEmitter()
  const onEnd = vi.fn()
  wireSessionEnd({ platform, win, powerMonitor, onEnd })
  return { win, powerMonitor, onEnd }
}

describe('wireSessionEnd', () => {
  test('win32: a logoff or shutdown query ends the session', () => {
    const { win, powerMonitor, onEnd } = setup('win32')
    win.emit('query-session-end', {})
    expect(onEnd).toHaveBeenCalledTimes(1)
    win.emit('session-end', {})
    expect(onEnd).toHaveBeenCalledTimes(2)
    powerMonitor.emit('shutdown', {})
    expect(onEnd).toHaveBeenCalledTimes(2)
  })

  test('linux: powerMonitor shutdown ends the session', () => {
    const { win, powerMonitor, onEnd } = setup('linux')
    powerMonitor.emit('shutdown', {})
    expect(onEnd).toHaveBeenCalledTimes(1)
    win.emit('query-session-end', {})
    win.emit('session-end', {})
    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  test('a throwing handler never escapes into the event', () => {
    const win = new EventEmitter()
    const onEnd = vi.fn(() => {
      throw new Error('x')
    })
    wireSessionEnd({ platform: 'win32', win, powerMonitor: new EventEmitter(), onEnd })
    expect(() => win.emit('session-end', {})).not.toThrow()
  })
})
