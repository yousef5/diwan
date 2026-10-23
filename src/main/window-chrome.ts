import type { Platform } from '../shared/types'

// The window frame per platform. Linux: frameless (on Hyprland the compositor draws the frame;
// floating desktops can turn on the shell's own window-controls bar). Windows: the native caption
// buttons drawn over the shell's 48 px context bar (Window Controls Overlay), in its colours; the
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
      // bg-1 (the context bar) and fg (styles.css).
      titleBarOverlay: { color: '#131316', symbolColor: '#e4e4e7', height: CAPTION_HEIGHT },
    }
  }
  return { frame: false }
}
