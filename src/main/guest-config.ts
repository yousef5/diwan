import type { ViewState } from '../shared/types'
import { WA_ORIGIN } from './link-policy'

const WA_ONLY_PERMISSIONS: ReadonlySet<string> = new Set([
  'notifications',
  'media',
  'clipboard-sanitized-write',
  'persistent-storage',
])

function originOf(url: string | undefined): string | undefined {
  if (!url) return undefined
  try {
    return new URL(url).origin
  } catch {
    return undefined
  }
}

// Permission allow-list. Fullscreen is harmless from anywhere; the rest only for WhatsApp Web.
export function allowGuestPermission(permission: string, requestingOrigin: string | undefined): boolean {
  if (permission === 'fullscreen') return true
  if (!WA_ONLY_PERMISSIONS.has(permission)) return false
  return originOf(requestingOrigin) === WA_ORIGIN
}

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

const ACCOUNT_PARTITION = /^persist:acc-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// Checked in will-attach-webview against BOTH the tag's params and the webPreferences object
// (a `webpreferences="partition=..."` attribute can smuggle a different partition).
export function isAllowedGuest(
  params: { src?: string; partition?: string },
  prefs: { partition?: unknown },
): boolean {
  if (originOf(params.src) !== WA_ORIGIN) return false
  if (typeof params.partition !== 'string' || !ACCOUNT_PARTITION.test(params.partition)) return false
  return prefs.partition === undefined || prefs.partition === params.partition
}

const KEPT_PREFERENCES = new Set(['zoomFactor', 'disablePopups'])

// Called from will-attach-webview: whatever the shell asked for, a guest gets exactly this.
export function applyGuestPreferences(
  prefs: Record<string, unknown>,
  preloadPath: string,
  partition: string,
): void {
  for (const key of Object.keys(prefs)) if (!KEPT_PREFERENCES.has(key)) Reflect.deleteProperty(prefs, key)
  Object.assign(prefs, {
    partition,
    preload: preloadPath,
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
}

// net::ERR_* codes that mean "no network" rather than "the page is broken".
const OFFLINE_ERRORS = new Set([-106, -105, -21, -130, -118, -137, -109, -331, -7, -104, -803, -111])

export function loadStateForError(code: number): Extract<ViewState, 'offline' | 'failed'> | null {
  if (code === -3) return null // ERR_ABORTED: a newer navigation replaced this one
  return OFFLINE_ERRORS.has(code) ? 'offline' : 'failed'
}
