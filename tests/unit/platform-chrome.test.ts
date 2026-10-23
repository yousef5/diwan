import { describe, expect, test } from 'vitest'
import { IMPORT_UNSUPPORTED, importSupported, linuxOnly } from '../../src/main/importer/gate'
import { windowChrome } from '../../src/main/window-chrome'

describe('window chrome', () => {
  test('Linux (and anything not Windows) stays frameless, with no overlay', () => {
    expect(windowChrome('linux')).toEqual({ frame: false })
    expect(windowChrome('darwin')).toEqual({ frame: false })
  })

  test('Windows keeps its frame and draws the native caption buttons over the 48 px context bar', () => {
    const c = windowChrome('win32')
    expect(c).toEqual({
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: '#131316', symbolColor: '#e4e4e7', height: 48 },
    })
    expect(c.frame).toBeUndefined()
  })
})

describe('Nexus import gate', () => {
  test('only Linux supports the import', () => {
    expect(importSupported('linux')).toBe(true)
    expect(importSupported('win32')).toBe(false)
    expect(importSupported('darwin')).toBe(false)
  })

  test('on Linux the handler runs as is, arguments and result passed through', async () => {
    const plan = linuxOnly('linux', (n: number) => n * 2)
    expect(plan(21)).toBe(42)
    const apply = linuxOnly('linux', async () => 'done')
    await expect(apply()).resolves.toBe('done')
  })

  test.each(['win32', 'darwin'] as const)('on %s the handler refuses without running', (platform) => {
    let ran = false
    const plan = linuxOnly(platform, () => {
      ran = true
    })
    expect(() => plan()).toThrow(IMPORT_UNSUPPORTED)
    expect(ran).toBe(false)
    expect(IMPORT_UNSUPPORTED).toMatch(/only available on Linux/)
  })
})
