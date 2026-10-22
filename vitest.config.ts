import { defineConfig } from 'vitest/config'
import pkg from './package.json'

export default defineConfig({
  // Same global electron.vite.config.ts injects into the renderer, so renderer code runs in tests.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  test: {
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
})
