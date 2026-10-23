import { beforeEach, expect, test, vi } from 'vitest'

const trays: { handlers: Map<string, () => void> }[] = []
vi.mock('electron', () => {
  class Tray {
    handlers = new Map<string, () => void>()
    constructor() {
      trays.push(this)
    }
    on(event: string, fn: () => void) {
      this.handlers.set(event, fn)
    }
    setToolTip() {}
    setImage() {}
    setContextMenu() {}
  }
  return {
    Tray,
    Menu: { buildFromTemplate: () => ({}) },
    nativeImage: { createFromPath: () => ({ isEmpty: () => false }), createFromDataURL: () => ({}) },
  }
})

const { TrayController } = await import('../../src/main/tray')
const { StateHub } = await import('../../src/main/state')
const { Store } = await import('../../src/main/store/store')
const { mkdtempSync } = await import('node:fs')
const { tmpdir } = await import('node:os')
const { join } = await import('node:path')

beforeEach(() => {
  trays.length = 0
})

function start(platform: 'win32' | 'linux') {
  const hub = new StateHub(new Store(mkdtempSync(join(tmpdir(), 'diwan-tray-')), 0), undefined, 0)
  const show = vi.fn()
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  const tray = new TrayController({
    hub,
    icon: 'tray.png',
    platform,
    log,
    show,
    reveal: vi.fn(),
    quit: vi.fn(),
  })
  expect(tray.start()).toBe(true)
  return { show, handlers: trays[0].handlers }
}

test('Windows: a click and a double-click both show the window', () => {
  const { show, handlers } = start('win32')
  handlers.get('click')?.()
  handlers.get('double-click')?.()
  expect(show).toHaveBeenCalledTimes(2)
})

test('Linux: a click shows it; no double-click handler', () => {
  const { show, handlers } = start('linux')
  handlers.get('click')?.()
  expect(show).toHaveBeenCalledOnce()
  expect(handlers.has('double-click')).toBe(false)
})
