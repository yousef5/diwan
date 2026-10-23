// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { Account, AccountRuntime, ShellCommand, Snapshot } from '../../src/shared/types'

const show = vi.fn(async (_total: number) => {})
vi.mock('../../src/renderer/trayBadges', () => ({ trayBadges: () => ({ show }) }))

const { App } = await import('../../src/renderer/App')
const { useUi } = await import('../../src/renderer/state')

const initial = useUi.getState()
const A = '0a000000-0000-4000-8000-00000000000a'
const B = '0b000000-0000-4000-8000-00000000000b'

function account(id: string, name: string, extra: Partial<Account> = {}): Account {
  return {
    id,
    name,
    color: '#2563eb',
    order: 0,
    zoom: 0,
    muted: false,
    customAvatar: false,
    createdAt: '2026-10-22T00:00:00.000Z',
    ...extra,
  }
}
const rt = (extra: Partial<AccountRuntime> = {}): AccountRuntime => ({
  state: 'ready',
  unread: 0,
  avatar: null,
  ...extra,
})

function snapshot(over: Partial<Snapshot> = {}): Snapshot {
  return {
    accounts: [account(A, 'Personal'), account(B, 'العائلة', { muted: true })],
    runtime: { [A]: rt({ unread: 2 }), [B]: rt({ unread: 5 }) },
    activeId: A,
    settings: {
      closeToTray: true,
      startHidden: false,
      showWindowControls: false,
      notifications: { enabled: true, sound: true, showPreview: true, markUrgent: true },
      window: { bounds: null, maximized: false },
    },
    recovery: false,
    importAvailable: false,
    trayAvailable: true,
    platform: 'linux',
    dataDir: '/home/u/.config/Diwan',
    ...over,
  }
}

const NO_IMPORT = {
  available: false,
  reason: 'Nexus is not installed on this computer',
  items: [],
  orphanDirs: 0,
  nexusRunning: false,
}

// Everything the App asks main, in order: 'onState', 'onCommand' and invoke channels.
let order: string[] = []
let stateListeners: ((s: Snapshot) => void)[] = []
let commandListeners: ((c: ShellCommand) => void)[] = []
let reply: (s: Snapshot) => void = () => {}
let replies: Promise<Snapshot>
const invoke = vi.fn()

const push = (s: Snapshot) =>
  act(() => {
    for (const l of stateListeners) l(s)
  })
const command = (c: ShellCommand) =>
  act(() => {
    for (const l of commandListeners) l(c)
  })
const answer = async (s: Snapshot) => {
  await act(async () => {
    reply(s)
    await replies
  })
}

beforeEach(() => {
  useUi.setState(initial, true)
  order = []
  stateListeners = []
  commandListeners = []
  show.mockClear()
  replies = new Promise<Snapshot>((r) => {
    reply = r
  })
  invoke.mockReset()
  invoke.mockImplementation((channel: string) => {
    order.push(channel)
    if (channel === 'state:get') return replies
    if (channel === 'importer:plan') return Promise.resolve(NO_IMPORT)
    return Promise.resolve(undefined)
  })
  window.diwan = {
    invoke,
    onState: (cb: (s: Snapshot) => void) => {
      order.push('onState')
      stateListeners.push(cb)
      return () => {
        stateListeners = stateListeners.filter((l) => l !== cb)
      }
    },
    onCommand: (cb: (c: ShellCommand) => void) => {
      order.push('onCommand')
      commandListeners.push(cb)
      return () => {
        commandListeners = commandListeners.filter((l) => l !== cb)
      }
    },
  } as unknown as Window['diwan']
  // jsdom has no <webview>; React says so once per run. Everything else still fails loudly.
  const original = console.error
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (String(args[0]).includes('is unrecognized in this browser')) return
    original(...args)
  })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('App: the first snapshot', () => {
  test('subscribes to pushes before asking for the state', () => {
    render(<App />)
    expect(order.indexOf('onState')).toBeGreaterThanOrEqual(0)
    expect(order.indexOf('onState')).toBeLessThan(order.indexOf('state:get'))
  })

  test('shows the fetched snapshot when no push came first', async () => {
    render(<App />)
    expect(useUi.getState().snap).toBeNull()
    const s = snapshot()
    await answer(s)
    expect(useUi.getState().snap).toBe(s)
    expect(screen.getByRole('navigation', { name: 'Accounts' })).toBeTruthy()
  })

  test('a push that arrives while state:get is out wins over the older reply', async () => {
    render(<App />)
    const newer = snapshot({ activeId: B })
    push(newer)
    await answer(snapshot())
    expect(useUi.getState().snap).toBe(newer)
  })

  test('later pushes replace the snapshot', async () => {
    render(<App />)
    await answer(snapshot())
    const next = snapshot({ activeId: B })
    push(next)
    expect(useUi.getState().snap).toBe(next)
  })

  test('unmounting unsubscribes, and a reply that comes after is dropped', async () => {
    const { unmount } = render(<App />)
    unmount()
    expect(stateListeners).toHaveLength(0)
    expect(commandListeners).toHaveLength(0)
    await answer(snapshot())
    expect(useUi.getState().snap).toBeNull()
  })

  test('a failed state:get is an error toast, and the next push still lands', async () => {
    invoke.mockImplementation((channel: string) =>
      channel === 'state:get' ? Promise.reject(new Error('boom')) : Promise.resolve(undefined),
    )
    await act(async () => {
      render(<App />)
    })
    expect(useUi.getState().toasts.map((t) => [t.text, t.error])).toEqual([['boom', true]])
    const s = snapshot()
    push(s)
    expect(useUi.getState().snap).toBe(s)
  })
})

describe('App: commands', () => {
  test('openSettings opens Settings over the stage, which stays mounted', async () => {
    render(<App />)
    await answer(snapshot())
    const before = Array.from(document.querySelectorAll('webview'))
    expect(before).toHaveLength(2)
    command({ type: 'openSettings' })
    expect(useUi.getState().settingsOpen).toBe(true)
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeTruthy()
    // Same nodes: nothing was unmounted, so no WhatsApp page reloads.
    expect(Array.from(document.querySelectorAll('webview'))).toEqual(before)
    expect(document.querySelectorAll('main')).toHaveLength(1)
    act(() => useUi.getState().closeSettings())
    expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull()
    expect(Array.from(document.querySelectorAll('webview'))).toEqual(before)
  })

  test('remount is handled once, by the stage, not again by App', async () => {
    render(<App />)
    await answer(snapshot())
    const old = document.querySelector(`webview[data-account="${A}"]`)
    command({ type: 'remount', id: A })
    expect(useUi.getState().remount[A]).toBe(1)
    expect(document.querySelector(`webview[data-account="${A}"]`)).not.toBe(old)
  })

  test('every layer is rendered once and gates itself', async () => {
    render(<App />)
    await answer(snapshot({ recovery: true, settings: { ...snapshot().settings, showWindowControls: true } }))
    expect(screen.getByRole('alert').textContent).toContain('settings file is damaged')
    expect(screen.getByRole('button', { name: 'Minimize' })).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('menu')).toBeNull()
  })
})

describe('App: import offer', () => {
  test('opens the import dialog by itself on a first run with Nexus and no accounts', async () => {
    render(<App />)
    await answer(snapshot({ accounts: [], runtime: {}, activeId: null, importAvailable: true }))
    expect(useUi.getState().dialog).toEqual({ kind: 'import' })
  })

  test('only once per launch: closing it and later pushes don’t bring it back', async () => {
    render(<App />)
    const first = snapshot({ accounts: [], runtime: {}, activeId: null, importAvailable: true })
    await answer(first)
    act(() => useUi.getState().openDialog(null))
    push({ ...first })
    expect(useUi.getState().dialog).toBeNull()
  })

  test('not when accounts exist, or Nexus isn’t there', async () => {
    render(<App />)
    await answer(snapshot({ importAvailable: true }))
    expect(useUi.getState().dialog).toBeNull()
    cleanup()
    useUi.setState(initial, true)
    replies = new Promise<Snapshot>((r) => {
      reply = r
    })
    render(<App />)
    await answer(snapshot({ accounts: [], runtime: {}, activeId: null }))
    expect(useUi.getState().dialog).toBeNull()
  })
})

describe('App: tray badge', () => {
  test('follows the unmuted unread total of every snapshot', async () => {
    render(<App />)
    await answer(snapshot())
    expect(show).toHaveBeenLastCalledWith(2) // B is muted: its 5 don't count
    push(snapshot({ runtime: { [A]: rt({ unread: 7 }), [B]: rt({ unread: 5 }) } }))
    expect(show).toHaveBeenLastCalledWith(7)
  })

  test('not when there is no tray, and not again for UI-only changes', async () => {
    render(<App />)
    await answer(snapshot({ trayAvailable: false }))
    expect(show).not.toHaveBeenCalled()
    push(snapshot())
    expect(show).toHaveBeenCalledTimes(1)
    act(() => useUi.getState().openSettings())
    act(() => useUi.getState().toast('hello'))
    expect(show).toHaveBeenCalledTimes(1)
  })
})
