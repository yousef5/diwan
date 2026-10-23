import type { Platform } from '../../shared/types'

// Nexus (MultiWhatsApp) only ever shipped for Linux, so the import is Linux-only.
export const importSupported = (platform: Platform): boolean => platform === 'linux'

export const IMPORT_UNSUPPORTED = 'Importing from Nexus is only available on Linux.'

// Wraps an importer IPC handler so that it refuses on other platforms.
export function linuxOnly<A extends unknown[], R>(
  platform: Platform,
  fn: (...args: A) => R,
): (...args: A) => R {
  return (...args) => {
    if (!importSupported(platform)) throw new Error(IMPORT_UNSUPPORTED)
    return fn(...args)
  }
}
