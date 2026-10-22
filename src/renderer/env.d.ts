/// <reference types="vite/client" />

import type { DiwanApi } from '../shared/api'

declare global {
  // Injected by electron.vite.config.ts from package.json.
  const __APP_VERSION__: string
  interface Window {
    diwan: DiwanApi
  }
}
