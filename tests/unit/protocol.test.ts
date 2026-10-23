import { describe, expect, test, vi } from 'vitest'
import { linkFromArgv, whatsappHandler } from '../../src/main/protocol'
import type { Platform } from '../../src/shared/types'

function fakeApp(registered = false) {
  let ours = registered
  return {
    setAsDefaultProtocolClient: vi.fn((..._a: unknown[]) => {
      ours = true
      return true
    }),
    removeAsDefaultProtocolClient: vi.fn((..._a: unknown[]) => {
      ours = false
      return true
    }),
    isDefaultProtocolClient: vi.fn((..._a: unknown[]) => ours),
  }
}

const EXE = 'C:\\Users\\u\\AppData\\Local\\Programs\\Diwan\\Diwan.exe'
const make = (platform: Platform, app = fakeApp(), dev = false) =>
  whatsappHandler({
    platform,
    app,
    execPath: EXE,
    defaultApp: dev,
    appPath: dev ? 'C:\\src\\diwan\\out\\main\\index.js' : undefined,
  })

describe('whatsappHandler on Windows', () => {
  test('on registers Diwan with `--` before the link; the state comes from the registry', () => {
    const app = fakeApp()
    const h = make('win32', app)
    expect(h.isRegistered()).toBe(false)
    expect(h.set(true)).toBe(true)
    expect(app.setAsDefaultProtocolClient).toHaveBeenCalledWith('whatsapp', EXE, ['--'])
    expect(app.isDefaultProtocolClient).toHaveBeenLastCalledWith('whatsapp', EXE, ['--'])
  })

  test('off removes it with the same arguments, only when it points at Diwan', () => {
    const app = fakeApp(true)
    expect(make('win32', app).set(false)).toBe(false)
    expect(app.removeAsDefaultProtocolClient).toHaveBeenCalledWith('whatsapp', EXE, ['--'])

    const other = fakeApp(false) // another app owns the handler
    expect(make('win32', other).set(false)).toBe(false)
    expect(other.removeAsDefaultProtocolClient).not.toHaveBeenCalled()
  })

  test('a dev run passes the app folder before `--`', () => {
    const app = fakeApp()
    make('win32', app, true).set(true)
    expect(app.setAsDefaultProtocolClient).toHaveBeenCalledWith('whatsapp', EXE, [
      'C:\\src\\diwan\\out\\main\\index.js',
      '--',
    ])
  })
})

test('on Linux the app never touches the handler', () => {
  const app = fakeApp()
  const h = make('linux', app)
  expect(h.isRegistered()).toBeNull()
  expect(h.set(true)).toBeNull()
  expect(h.set(false)).toBeNull()
  expect(app.setAsDefaultProtocolClient).not.toHaveBeenCalled()
  expect(app.removeAsDefaultProtocolClient).not.toHaveBeenCalled()
  expect(app.isDefaultProtocolClient).not.toHaveBeenCalled()
})

describe('linkFromArgv', () => {
  const link = 'whatsapp://send?phone=201000000000'
  test('Windows: only the argument right after `--`', () => {
    expect(linkFromArgv([EXE, '--', link], 'win32')).toBe(link)
    expect(linkFromArgv([EXE, '--allow-file-access', '--', link], 'win32')).toBe(link)
    expect(linkFromArgv([EXE, link], 'win32')).toBeNull() // no `--`: not from the handler
    expect(linkFromArgv([EXE, link, '--', 'x'], 'win32')).toBeNull()
    expect(linkFromArgv([EXE, '--'], 'win32')).toBeNull()
  })

  test('Windows: a link carrying switches stays one argument; nothing after it is read', () => {
    const evil = 'whatsapp://x --inspect=9229'
    expect(linkFromArgv([EXE, '--', evil], 'win32')).toBe(evil)
    expect(linkFromArgv([EXE, '--', '--inspect', link], 'win32')).toBeNull()
  })

  test('Linux: the link wherever the desktop file put it', () => {
    expect(linkFromArgv(['/usr/bin/diwan', link], 'linux')).toBe(link)
    expect(linkFromArgv(['/usr/bin/diwan', '--', link], 'linux')).toBe(link)
    expect(linkFromArgv(['/usr/bin/diwan'], 'linux')).toBeNull()
  })
})
