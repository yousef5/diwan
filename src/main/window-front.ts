import type { Platform } from '../shared/types'

export interface FrontWindow {
  isMinimized(): boolean
  restore(): void
  show(): void
  focus(): void
  setAlwaysOnTop(flag: boolean): void
  isAlwaysOnTop(): boolean
}

// Shows the window and brings it to the front (a tray click, a second launch, a notification).
// Windows' foreground lock can leave a window shown but behind the active app, flashing in the
// taskbar. A brief always-on-top raises it above that app and focus() then takes the foreground.
// (app.focus's `steal` option is macOS-only, so it is no help here.)
// Pure: the window and app.focus come in as arguments.
export function bringToFront(w: FrontWindow, platform: Platform, focusApp: () => void): void {
  if (w.isMinimized()) w.restore()
  w.show()
  if (platform === 'win32' && !w.isAlwaysOnTop()) {
    w.setAlwaysOnTop(true)
    try {
      w.focus()
    } finally {
      w.setAlwaysOnTop(false) // even when focus() throws: never leave the window stuck on top
    }
  } else w.focus()
  if (platform === 'win32') focusApp()
}
