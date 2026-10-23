// The close-to-tray handler cancels window closes, which would block a Windows logoff. A session end
// (Windows) or system shutdown (Linux) must instead mark the app as quitting and save settings.
// Windows first asks (query-session-end), and the user or another app can still cancel the logoff
// then: a query only saves, so a cancelled logoff leaves close-to-tray working.
// Pure: takes plain emitters, so it is testable without Electron.

interface Emitter {
  on(event: string, listener: () => void): unknown
}

export function wireSessionEnd(d: {
  platform: NodeJS.Platform
  win: Emitter | null
  powerMonitor: Emitter
  // The session may end: save now, change nothing else.
  onQuery: () => void
  // The session is ending: let the window close, and save.
  onEnd: () => void
}): void {
  const safe = (fn: () => void) => () => {
    try {
      fn()
    } catch {}
  }
  if (d.platform === 'win32') {
    d.win?.on('query-session-end', safe(d.onQuery))
    d.win?.on('session-end', safe(d.onEnd))
  } else if (d.platform === 'linux') {
    d.powerMonitor.on('shutdown', safe(d.onEnd))
  }
}
