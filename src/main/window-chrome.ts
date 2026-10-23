import type { Platform } from '../shared/types'

// The window frame per platform. Linux: frameless (on Hyprland the compositor draws the frame;
// floating desktops can turn on the shell's own window-controls bar). Windows: the native caption
// buttons drawn over the shell's 48 px context bar (Window Controls Overlay) on a transparent band; the
// shell keeps them clear with the env(titlebar-area-*) variables.
export interface WindowChrome {
  frame?: false
  titleBarStyle?: 'hidden'
  titleBarOverlay?: { color: string; symbolColor: string; height: number }
}

export const CAPTION_HEIGHT = 48 // the context bar's height (h-12)

export function windowChrome(platform: Platform): WindowChrome {
  if (platform === 'win32') {
    return {
      titleBarStyle: 'hidden',
      // A transparent band, so whatever the shell draws under the buttons shows through (the context
      // bar and its bottom border, or the bg-0 Settings and welcome screens); symbols in fg (styles.css).
      titleBarOverlay: { color: '#00000000', symbolColor: '#e4e4e7', height: CAPTION_HEIGHT },
    }
  }
  return { frame: false }
}
