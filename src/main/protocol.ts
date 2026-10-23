import type { Platform } from '../shared/types'

// whatsapp: links, opt-in only (Settings → General). Diwan never registers itself on its own.
// - Windows: the per-user registry handler, set and removed through Electron. Its command is
//   `Diwan.exe -- "%1"`: everything after `--` is the link, never a switch, so a crafted link like
//   `whatsapp://x --inspect` can't pass Chromium or Diwan an argument (see linkFromArgv).
// - Linux: the handler is the user's xdg-mime choice; the app makes no xdg calls, Settings only
//   shows the command (src/shared/protocol.ts).
// Pure: Electron's `app` comes in through the deps.

export const WHATSAPP = 'whatsapp'

export interface ProtocolApp {
  setAsDefaultProtocolClient(protocol: string, path?: string, args?: string[]): boolean
  removeAsDefaultProtocolClient(protocol: string, path?: string, args?: string[]): boolean
  isDefaultProtocolClient(protocol: string, path?: string, args?: string[]): boolean
}

export interface ProtocolDeps {
  platform: Platform
  app: ProtocolApp
  execPath: string
  // Electron started on a script (a dev run): the handler must pass the app folder too.
  defaultApp: boolean
  appPath: string | undefined // process.argv[1], resolved
}

export interface WhatsappHandler {
  // Windows: whether the handler points at this Diwan. null where the app doesn't manage it.
  isRegistered(): boolean | null
  // Turns it on or off, and returns the state afterwards (null: not managed here).
  set(enabled: boolean): boolean | null
}

export function whatsappHandler(d: ProtocolDeps): WhatsappHandler {
  const args = d.defaultApp && d.appPath ? [d.appPath, '--'] : ['--']
  const isRegistered = () =>
    d.platform === 'win32' ? d.app.isDefaultProtocolClient(WHATSAPP, d.execPath, args) : null
  return {
    isRegistered,
    set(enabled) {
      if (d.platform !== 'win32') return null
      if (enabled) d.app.setAsDefaultProtocolClient(WHATSAPP, d.execPath, args)
      // Only ever our own handler: another app's stays.
      else if (isRegistered()) d.app.removeAsDefaultProtocolClient(WHATSAPP, d.execPath, args)
      return isRegistered()
    },
  }
}

// The whatsapp: link a launch or a second instance was given, if any. On Windows only what follows
// `--` counts (the registered command puts the link there, quoted as one argument), so nothing
// before it is ever read as a link. Elsewhere the desktop file passes it as-is.
// The link is still only a candidate: classifyLink decides what it may do.
export function linkFromArgv(argv: readonly string[], platform: Platform): string | null {
  const isLink = (a: string) => a.toLowerCase().startsWith('whatsapp:')
  if (platform === 'win32') {
    const end = argv.indexOf('--')
    if (end < 0) return null
    // Chromium inserts any switches it adds before `--`, so the link is the first argument after it.
    const link = argv[end + 1]
    return link !== undefined && isLink(link) ? link : null
  }
  return argv.find(isLink) ?? null
}
