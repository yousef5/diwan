import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { AccountRuntime, ShellCommand } from '../../src/shared/types'

vi.mock('../../src/main/context-menu-popup', () => ({ popupContextMenu: vi.fn() }))
vi.mock('../../src/main/link-actions', () => ({ performLink: vi.fn() }))

import { resetCrashes, setClock, wireGuest } from '../../src/main/guests'

class FakeWc extends EventEmitter {
  static next = 1
  id = FakeWc.next++
  url = 'https://web.whatsapp.com/'
  title = 'WhatsApp'
  destroyed = false
  isDestroyed = () => this.destroyed
  setWindowOpenHandler = vi.fn()
  stop = vi.fn()
  loadURL = vi.fn()
  getURL = () => this.url
  getTitle = () => this.title
  setZoomLevel = vi.fn()
}

function setup() {
  const runtime = new Map<string, AccountRuntime>()
  const sent: ShellCommand[] = []
  const hub = {
    runtimeOf: (id: string): AccountRuntime =>
      runtime.get(id) ?? { state: 'loading', unread: 0, avatar: null },
    setRuntime: (id: string, patch: Partial<AccountRuntime>) =>
      runtime.set(id, { ...hub.runtimeOf(id), ...patch }),
    account: () => ({ zoom: 0 }),
  }
  const deps = {
    hub,
    registry: { attach: vi.fn(), detach: vi.fn() },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    dev: false,
    sendShell: (c: ShellCommand) => sent.push(c),
    onShortcut: vi.fn(),
  }
  const wire = (id: string) => {
    const wc = new FakeWc()
    // biome-ignore lint/suspicious/noExplicitAny: minimal fakes for Electron objects
    wireGuest(wc as any, id, deps as any)
    return wc
  }
  return { hub, sent, wire }
}

describe('wireGuest crash backoff', () => {
  beforeEach(() => {
    setClock(() => 1_000_000)
    resetCrashes('a')
  })

  test('3 crashes across remounts give up; resetCrashes re-arms', () => {
    const { hub, sent, wire } = setup()
    for (let i = 0; i < 3; i++) wire('a').emit('render-process-gone', {}, { reason: 'crashed' })
    expect(sent).toHaveLength(2)
    expect(hub.runtimeOf('a').state).toBe('failed')
    resetCrashes('a')
    wire('a').emit('render-process-gone', {}, { reason: 'crashed' })
    expect(sent).toHaveLength(3)
  })

  test('crashes older than 60 s do not count', () => {
    const { sent, wire } = setup()
    let t = 1_000_000
    setClock(() => t)
    for (let i = 0; i < 4; i++) {
      wire('a').emit('render-process-gone', {}, { reason: 'crashed' })
      t += 61_000
    }
    expect(sent).toHaveLength(4)
  })
})

describe('wireGuest load state', () => {
  test('unread is re-read from the title when loading finishes', () => {
    const { hub, wire } = setup()
    const wc = wire('b')
    wc.title = '(3) WhatsApp'
    wc.emit('page-title-updated', {}, wc.title)
    wc.emit('did-stop-loading')
    expect(hub.runtimeOf('b').unread).toBe(3)
    wc.emit('did-start-loading') // reload
    wc.title = 'WhatsApp'
    wc.emit('page-title-updated', {}, 'WhatsApp') // ignored while loading
    expect(hub.runtimeOf('b').unread).toBe(3)
    wc.emit('did-stop-loading')
    expect(hub.runtimeOf('b')).toMatchObject({ state: 'ready', unread: 0 })
  })

  test('a non-WhatsApp page after loading is failed, not ready', () => {
    const { hub, wire } = setup()
    const wc = wire('c')
    wc.url = 'about:blank'
    wc.emit('did-stop-loading')
    expect(hub.runtimeOf('c').state).toBe('failed')
  })
})
