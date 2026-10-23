import type { Platform } from '../shared/types'

// Anything that is not Windows or macOS behaves like Linux (the BSDs included).
export function platformOf(p: string = process.platform): Platform {
  return p === 'win32' || p === 'darwin' ? p : 'linux'
}
