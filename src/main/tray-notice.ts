// The first time closing the window hides Diwan to the tray, say so once: on desktops whose tray is
// hard to find (GNOME needs an extension), a closed window otherwise looks like a quit app.
// Shown even with notifications turned off (it is about Diwan itself, and only ever once), and
// remembered in the settings file. In recovery mode nothing can be saved, so it is at most once
// per run instead.
// Pure: the notification and the store come in through the deps.

export const TRAY_NOTICE = {
  title: 'Diwan is still running',
  body: 'Open it from the tray or your app menu.',
} as const

export interface TrayNoticeDeps {
  shown(): boolean
  markShown(): void
  // Shows the notification; false when the desktop has no notifications.
  notify(title: string, body: string): boolean
  warn(message: string, e?: unknown): void
}

export function createTrayNotice(d: TrayNoticeDeps): { hiddenByClose(): void } {
  let thisRun = false
  return {
    hiddenByClose() {
      if (thisRun || d.shown()) return
      thisRun = true
      try {
        if (d.notify(TRAY_NOTICE.title, TRAY_NOTICE.body)) d.markShown()
      } catch (e) {
        d.warn('could not show the still-running notice', e)
      }
    },
  }
}
