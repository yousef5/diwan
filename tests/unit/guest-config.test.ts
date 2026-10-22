import { describe, expect, test } from 'vitest'
import {
  allowGuestPermission,
  applyGuestPreferences,
  chromeUserAgent,
  isAllowedGuest,
  loadStateForError,
  partitionOf,
  pickSpellLanguages,
} from '../../src/main/guest-config'

describe('guest config', () => {
  test('partition name', () => expect(partitionOf('abc')).toBe('persist:acc-abc'))

  test('user agent is real Chrome, reduced form, no Electron', () => {
    const ua = chromeUserAgent('138.0.7204.97')
    expect(ua).toBe(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
    )
    expect(ua).not.toMatch(/Electron|Diwan/)
  })

  test('spell languages: English + Arabic when offered', () => {
    expect(pickSpellLanguages(['ar', 'de', 'en-US'])).toEqual(['en-US', 'ar'])
    expect(pickSpellLanguages(['en-GB'])).toEqual([])
  })

  test('permissions are origin-checked', () => {
    const wa = 'https://web.whatsapp.com'
    expect(allowGuestPermission('media', wa)).toBe(true)
    expect(allowGuestPermission('media', `${wa}/some/path`)).toBe(true)
    expect(allowGuestPermission('media', 'https://evil.example')).toBe(false)
    expect(allowGuestPermission('media', undefined)).toBe(false)
    expect(allowGuestPermission('media', 'not a url')).toBe(false)
    expect(allowGuestPermission('fullscreen', 'https://evil.example')).toBe(true)
    expect(allowGuestPermission('clipboard-read', wa)).toBe(false)
    expect(allowGuestPermission('persistent-storage', wa)).toBe(true)
    expect(allowGuestPermission('notifications', wa)).toBe(true)
    expect(allowGuestPermission('clipboard-sanitized-write', wa)).toBe(true)
  })

  const UUID = '123e4567-e89b-42d3-a456-426614174000'
  const P = `persist:acc-${UUID}`
  const SRC = 'https://web.whatsapp.com/'

  test('only WhatsApp Web with a real account partition may load in a webview', () => {
    expect(isAllowedGuest({ src: SRC, partition: P }, {})).toBe(true)
    expect(isAllowedGuest({ src: SRC, partition: P }, { partition: P })).toBe(true)
    expect(isAllowedGuest({ src: 'https://evil.example/', partition: P }, {})).toBe(false)
    expect(isAllowedGuest({ src: 'https://web.whatsapp.com.evil.example/', partition: P }, {})).toBe(false)
    expect(isAllowedGuest({ src: 'https://web.whatsapp.com@evil/', partition: P }, {})).toBe(false)
    expect(isAllowedGuest({ src: 'https://web.whatsapp.com./', partition: P }, {})).toBe(false)
    expect(isAllowedGuest({ src: 'garbage', partition: P }, {})).toBe(false)
    expect(isAllowedGuest({ src: SRC, partition: 'persist:other' }, {})).toBe(false)
  })

  test('partition must be present and well-formed', () => {
    expect(isAllowedGuest({ src: SRC }, {})).toBe(false)
    expect(isAllowedGuest({ src: SRC, partition: '' }, {})).toBe(false)
    expect(isAllowedGuest({ src: SRC, partition: 'persist:acc-' }, {})).toBe(false)
    expect(isAllowedGuest({ src: SRC, partition: 'persist:acc-../x' }, {})).toBe(false)
  })

  test('a smuggled prefs.partition that differs is rejected', () => {
    expect(isAllowedGuest({ src: SRC, partition: P }, { partition: 'persist:evil' })).toBe(false)
  })

  test('guest preferences come from an allow-list', () => {
    const prefs: Record<string, unknown> = {
      nodeIntegration: true,
      preloadURL: 'file:///x.js',
      sandbox: false,
      zoomFactor: 1,
      disablePopups: true,
      experimentalFeatures: true,
      enableBlinkFeatures: 'X',
      additionalArguments: ['--no-sandbox'],
      partition: 'persist:evil',
    }
    applyGuestPreferences(prefs, '/app/out/preload/guest.js', P)
    expect(prefs).toEqual({
      zoomFactor: 1,
      disablePopups: true,
      partition: P,
      preload: '/app/out/preload/guest.js',
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      nodeIntegrationInWorker: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      experimentalFeatures: false,
      plugins: false,
      navigateOnDragDrop: false,
      javascript: true,
      spellcheck: true,
    })
  })

  test('load errors', () => {
    expect(loadStateForError(-3)).toBeNull()
    expect(loadStateForError(-106)).toBe('offline')
    expect(loadStateForError(-105)).toBe('offline')
    for (const c of [-331, -7, -104, -803, -111]) expect(loadStateForError(c)).toBe('offline')
    expect(loadStateForError(-310)).toBe('failed')
  })
})
