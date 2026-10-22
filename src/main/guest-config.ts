import type { ViewState } from '../shared/types'
import { WA_ORIGIN } from './link-policy'

export const GUEST_PERMISSIONS: ReadonlySet<string> = new Set([
  'notifications',
  'media',
  'clipboard-sanitized-write',
  'fullscreen',
])

export const partitionOf = (accountId: string): string => `persist:acc-${accountId}`

// The UA of the Chrome bundled in this Electron, in Chrome's reduced form. A stale or
// Electron-branded UA makes WhatsApp Web show "update your browser" banners.
export function chromeUserAgent(chromeVersion: string = process.versions.chrome): string {
  const major = chromeVersion.split('.')[0]
  return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`
}

export function pickSpellLanguages(available: readonly string[]): string[] {
  return ['en-US', 'ar'].filter((l) => available.includes(l))
}

export function isAllowedGuest(params: { src?: string; partition?: string }): boolean {
  if (!params.src?.startsWith(`${WA_ORIGIN}/`)) return false
  return params.partition === undefined || params.partition.startsWith('persist:acc-')
}

// Called from will-attach-webview: whatever the shell asked for, a guest gets exactly this.
export function applyGuestPreferences(prefs: Record<string, unknown>, preloadPath: string): void {
  Reflect.deleteProperty(prefs, 'preloadURL')
  Object.assign(prefs, {
    preload: preloadPath,
    nodeIntegration: false,
    nodeIntegrationInSubFrames: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    webviewTag: false,
    spellcheck: true,
  })
}

// net::ERR_* codes that mean "no network" rather than "the page is broken".
const OFFLINE_ERRORS = new Set([-106, -105, -21, -130, -118, -137, -109])

export function loadStateForError(code: number): Extract<ViewState, 'offline' | 'failed'> | null {
  if (code === -3) return null // ERR_ABORTED: a newer navigation replaced this one
  return OFFLINE_ERRORS.has(code) ? 'offline' : 'failed'
}
