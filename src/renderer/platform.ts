import type { Snapshot } from '../shared/types'

// Platform-dependent shell chrome. main sends the platform in every snapshot.

// Windows: the native minimize/maximize/close buttons are drawn over the top-right 48 px of the
// window (titleBarOverlay). Whatever sits there reserves their width with the caption-* classes,
// which use --caption-w (styles.css).
export const hasCaptionButtons = (snap: Snapshot | null): boolean => snap?.platform === 'win32'

// The shell's own window-controls bar: Linux floating desktops, when turned on. Windows has native ones.
export const windowControlsShown = (snap: Snapshot | null): boolean =>
  !!snap && snap.platform !== 'win32' && snap.settings.showWindowControls

// Nexus only ever existed on Linux.
export const nexusImportSupported = (snap: Snapshot | null): boolean => snap?.platform === 'linux'

// Offer the import (startup offer, welcome screen): main found something to import.
export const importOffered = (snap: Snapshot | null): boolean =>
  nexusImportSupported(snap) && !!snap?.importAvailable
