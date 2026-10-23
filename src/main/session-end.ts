// The close-to-tray handler cancels window closes, which would block a Windows logoff. A session end
// (Windows) or system shutdown (Linux) must instead mark the app as quitting and save settings.
// Pure: takes plain emitters, so it is testable without Electron.

interface Emitter {
  on(event: string, listener: () => void): unknown
}

export function wireSessionEnd(d: {
  platform: NodeJS.Platform
  win: Emitter | null
  powerMonitor: Emitter
  onEnd: () => void
}): void {
  const end = () => {
    try {
      d.onEnd()
    } catch {}
  }
  if (d.platform === 'win32') {
    d.win?.on('query-session-end', end)
    d.win?.on('session-end', end)
  } else if (d.platform === 'linux') {
    d.powerMonitor.on('shutdown', end)
  }
}
