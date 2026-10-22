import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'
import type { Plugin } from 'vite'

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
].join('; ')

function cspInBuild(): Plugin {
  return {
    name: 'diwan-csp',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
        injectTo: 'head-prepend',
      },
    ],
  }
}

// Sandboxed preloads can only require('electron'): fail the build if Rollup splits out a shared chunk
// or a preload imports anything else.
function selfContainedPreloads(): Plugin {
  return {
    name: 'diwan-self-contained-preloads',
    apply: 'build',
    generateBundle(_o, bundle) {
      for (const out of Object.values(bundle)) {
        if (out.type !== 'chunk') continue
        if (!out.isEntry)
          this.error(`shared preload chunk ${out.fileName}: sandboxed preloads cannot require siblings`)
        const bad = out.imports.filter((id) => id !== 'electron')
        if (bad.length) this.error(`preload ${out.fileName} requires ${bad.join(', ')}`)
      }
    },
  }
}

export default defineConfig({
  main: {
    build: { rollupOptions: { input: { index: resolve(__dirname, 'src/main/index.ts') } } },
  },
  preload: {
    plugins: [selfContainedPreloads()],
    build: {
      externalizeDeps: false,
      rollupOptions: {
        input: {
          shell: resolve(__dirname, 'src/preload/shell.ts'),
          guest: resolve(__dirname, 'src/preload/guest.ts'),
        },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    build: { minify: true, rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') } },
    plugins: [react(), tailwindcss(), cspInBuild()],
  },
})
