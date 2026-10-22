import { describe, expect, test } from 'vitest'
import {
  applyGuestPreferences,
  chromeUserAgent,
  GUEST_PERMISSIONS,
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

  test('permissions: only what WhatsApp needs', () => {
    expect([...GUEST_PERMISSIONS].sort()).toEqual([
      'clipboard-sanitized-write',
      'fullscreen',
      'media',
      'notifications',
    ])
  })

  test('only WhatsApp Web may load in a webview', () => {
    expect(isAllowedGuest({ src: 'https://web.whatsapp.com/', partition: 'persist:acc-1' })).toBe(true)
    expect(isAllowedGuest({ src: 'https://web.whatsapp.com/' })).toBe(true)
    expect(isAllowedGuest({ src: 'https://evil.example/' })).toBe(false)
    expect(isAllowedGuest({ src: 'https://web.whatsapp.com.evil.example/' })).toBe(false)
    expect(isAllowedGuest({ src: 'https://web.whatsapp.com/', partition: 'persist:other' })).toBe(false)
  })

  test('guest preferences are forced safe; unrelated keys survive', () => {
    const prefs: Record<string, unknown> = {
      nodeIntegration: true,
      preloadURL: 'file:///x.js',
      sandbox: false,
      zoomFactor: 1,
    }
    applyGuestPreferences(prefs, '/app/out/preload/guest.js')
    expect(prefs).toEqual({
      zoomFactor: 1,
      preload: '/app/out/preload/guest.js',
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      spellcheck: true,
    })
  })

  test('load errors', () => {
    expect(loadStateForError(-3)).toBeNull()
    expect(loadStateForError(-106)).toBe('offline')
    expect(loadStateForError(-105)).toBe('offline')
    expect(loadStateForError(-310)).toBe('failed')
  })
})
