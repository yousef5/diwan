// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { isAllowedGuest } from '../../src/main/guest-config'
import { ContextBar, nextUnread, zoomPercent } from '../../src/renderer/components/ContextBar'
import { RecoveryBanner } from '../../src/renderer/components/RecoveryBanner'
import { Stage } from '../../src/renderer/components/Stage'
import { WindowControls } from '../../src/renderer/components/WindowControls'
import { useUi } from '../../src/renderer/state'
import type { Account, AccountRuntime, ShellCommand, Snapshot, ViewState } from '../../src/shared/types'

const initial = useUi.getState()
const invoke = vi.fn()
let commandListeners: ((c: ShellCommand) => void)[] = []
const unsubscribed = vi.fn()

// Real UUIDs: main's guard only accepts persist:acc-<uuid>. Sorted: A < B < C < D.
const A = '0a000000-0000-4000-8000-00000000000a'
const B = '0b000000-0000-4000-8000-00000000000b'
const C = '0c000000-0000-4000-8000-00000000000c'
const D = '0d000000-0000-4000-8000-00000000000d'

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
    accounts: [
      account(A, 'Personal'),
      account(B, 'Pharmacy', { color: '#0d9488' }),
      account(C, 'Family', { muted: true }),
      account(D, 'محمد يوسف'),
    ],
    runtime: { [A]: rt(), [B]: rt({ unread: 12 }), [C]: rt({ unread: 3 }), [D]: rt() },
    activeId: B,
    settings: { showWindowControls: false } as Snapshot['settings'],
    recovery: false,
    importAvailable: false,
    trayAvailable: true,
    ...over,
  }
}

const setSnap = (over: Partial<Snapshot> = {}) => act(() => useUi.getState().setSnap(snapshot(over)))
const withState = (id: string, state: ViewState, over: Partial<Snapshot> = {}) => {
  const base = snapshot(over)
  setSnap({ ...over, runtime: { ...base.runtime, [id]: rt({ ...base.runtime[id], state }) } })
}
const command = (c: ShellCommand) =>
  act(() => {
    for (const l of commandListeners) l(c)
  })

const webviews = () => Array.from(document.querySelectorAll<HTMLElement>('webview'))
const webview = (id: string) => document.querySelector<HTMLElement>(`webview[data-account="${id}"]`)
const status = () => screen.getByRole('status')

beforeEach(() => {
  useUi.setState(initial, true)
  invoke.mockReset()
  invoke.mockResolvedValue(undefined)
  commandListeners = []
  unsubscribed.mockReset()
  window.diwan = {
    invoke,
    onState: vi.fn(),
    onCommand: (cb: (c: ShellCommand) => void) => {
      commandListeners.push(cb)
      return () => {
        commandListeners = commandListeners.filter((l) => l !== cb)
        unsubscribed()
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

describe('Stage: webviews', () => {
  test('one webview per account, with exactly the attributes main’s guard accepts', () => {
    setSnap()
    render(<Stage />)
    expect(webviews()).toHaveLength(4)
    for (const id of [A, B, C, D]) {
      const el = webview(id) as HTMLElement
      expect(el.getAttribute('partition')).toBe(`persist:acc-${id}`)
      expect(el.getAttribute('src')).toBe('https://web.whatsapp.com/')
      expect(el.getAttribute('allowpopups')).toBe('true')
      expect(el.hasAttribute('webpreferences')).toBe(false)
      expect(el.hasAttribute('nodeintegration')).toBe(false)
      expect(el.hasAttribute('preload')).toBe(false)
      const params = {
        src: el.getAttribute('src') ?? undefined,
        partition: el.getAttribute('partition') ?? undefined,
      }
      expect(isAllowedGuest(params, {})).toBe(true)
    }
  })

  test('only the active webview is visible; the others are hidden and inert', () => {
    setSnap()
    render(<Stage />)
    for (const id of [A, C, D]) {
      expect(webview(id)?.className).toContain('invisible')
      expect(webview(id)?.hasAttribute('inert')).toBe(true)
    }
    expect(webview(B)?.className).toContain('visible z-10')
    expect(webview(B)?.className).not.toContain('invisible')
    expect(webview(B)?.hasAttribute('inert')).toBe(false)
  })

  test('switching accounts keeps every webview mounted (same nodes)', () => {
    setSnap()
    render(<Stage />)
    const before = webviews()
    setSnap({ activeId: A })
    expect(webviews()).toEqual(before)
    expect(webview(A)?.hasAttribute('inert')).toBe(false)
    expect(webview(B)?.hasAttribute('inert')).toBe(true)
  })

  test('reordering accounts never moves a webview in the DOM (moving one reloads WhatsApp)', () => {
    setSnap()
    render(<Stage />)
    const before = webviews()
    const [a, b, c, d] = snapshot().accounts
    setSnap({ accounts: [d, c, b, a] })
    expect(webviews()).toEqual(before)
    // A new account only adds its own node.
    const E = '0e000000-0000-4000-8000-00000000000e'
    const early = '01000000-0000-4000-8000-000000000001'
    setSnap({
      accounts: [d, account(E, 'New'), c, b, account(early, 'Early'), a],
      runtime: { ...snapshot().runtime, [E]: rt(), [early]: rt() },
    })
    expect(webviews().filter((w) => before.includes(w))).toEqual(before)
    expect(webviews()).toHaveLength(6)
  })

  test('an account that is logging out has no webview; the others are untouched', () => {
    setSnap()
    render(<Stage />)
    const others = [webview(A), webview(C), webview(D)]
    withState(B, 'loggingOut')
    expect(webview(B)).toBeNull()
    expect([webview(A), webview(C), webview(D)]).toEqual(others)
    expect(screen.getByRole('heading', { name: 'Logging out…' })).toBeTruthy()
  })

  test('a remount command replaces that account’s webview only', () => {
    setSnap()
    render(<Stage />)
    const [a, b] = [webview(A), webview(B)]
    command({ type: 'remount', id: B })
    expect(webview(B)).not.toBe(b)
    expect(webview(B)?.getAttribute('partition')).toBe(`persist:acc-${B}`)
    expect(webview(A)).toBe(a)
    command({ type: 'openSettings' })
    expect(useUi.getState().remount).toEqual({ [B]: 1 })
  })

  test('remount is honoured in any state: during a logout the fresh webview mounts when it ends', () => {
    setSnap()
    render(<Stage />)
    const old = webview(B)
    withState(B, 'loggingOut')
    command({ type: 'remount', id: B })
    expect(webview(B)).toBeNull()
    withState(B, 'loading')
    expect(webview(B)).not.toBeNull()
    expect(webview(B)).not.toBe(old)
    // and for a hung page
    const hung = webview(B)
    withState(B, 'hung')
    command({ type: 'remount', id: B })
    expect(webview(B)).not.toBe(hung)
  })

  test('the command listener is removed on unmount', () => {
    setSnap()
    const { unmount } = render(<Stage />)
    expect(commandListeners).toHaveLength(1)
    unmount()
    expect(commandListeners).toHaveLength(0)
    expect(unsubscribed).toHaveBeenCalledTimes(1)
  })

  test('<main> is the programmatic focus fallback (tabindex -1)', () => {
    setSnap()
    render(<Stage />)
    expect(screen.getByRole('main').getAttribute('tabindex')).toBe('-1')
  })

  test('the active webview takes focus on start, on switch and after a remount', () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus')
    const focused = () => focus.mock.contexts.at(-1)
    setSnap()
    render(<Stage />)
    expect(focused()).toBe(webview(B))
    setSnap({ activeId: A })
    expect(focused()).toBe(webview(A))
    command({ type: 'remount', id: A })
    expect(focused()).toBe(webview(A))
  })

  test('a switch never pulls focus out of an open dialog or Settings', () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus')
    setSnap()
    render(<Stage />)
    focus.mockClear()
    act(() => useUi.getState().openDialog({ kind: 'add' }))
    setSnap({ activeId: A })
    act(() => useUi.getState().openDialog(null))
    act(() => useUi.getState().openSettings())
    setSnap({ activeId: D })
    expect(focus).not.toHaveBeenCalled()
  })
})

describe('Stage: status overlay', () => {
  test('nothing covers a loading or ready page', () => {
    withState(B, 'loading')
    render(<Stage />)
    expect(screen.queryByTestId('status-overlay')).toBeNull()
    withState(B, 'ready')
    expect(screen.queryByTestId('status-overlay')).toBeNull()
  })

  test.each([
    ['offline', 'You’re offline', true],
    ['failed', 'WhatsApp didn’t load', true],
    ['hung', 'WhatsApp stopped responding', false],
    ['loggingOut', 'Logging out…', false],
  ] as const)('%s: "%s" over the page, with Retry: %s', (state, title, actions) => {
    withState(B, state)
    render(<Stage />)
    const overlay = screen.getByTestId('status-overlay')
    expect(within(overlay).getByRole('heading', { name: title })).toBeTruthy()
    expect(within(overlay).queryByRole('button', { name: 'Retry' }) !== null).toBe(actions)
    expect(within(overlay).queryByRole('button', { name: 'Restart WhatsApp' }) !== null).toBe(actions)
  })

  test('only the active account’s state is shown; a covered webview is inert', () => {
    withState(A, 'offline')
    render(<Stage />)
    expect(screen.queryByTestId('status-overlay')).toBeNull()
    withState(B, 'failed')
    expect(screen.getByTestId('status-overlay')).toBeTruthy()
    expect(webview(B)?.hasAttribute('inert')).toBe(true)
  })

  test('Retry reloads through main; Restart WhatsApp remounts the webview', async () => {
    withState(B, 'failed')
    render(<Stage />)
    const before = webview(B)
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(invoke).toHaveBeenCalledWith('account:reload', { id: B })
    await userEvent.click(screen.getByRole('button', { name: 'Restart WhatsApp' }))
    expect(webview(B)).not.toBe(before)
  })

  test('when the page under it had focus, focus moves to Retry instead of <body>', () => {
    setSnap()
    render(<Stage />)
    withState(B, 'offline')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Retry' }))
    withState(B, 'hung')
    expect(document.activeElement).toBe(screen.getByRole('main'))
  })

  test('state changes are announced politely in a status region', () => {
    setSnap()
    render(<Stage />)
    expect(status().getAttribute('aria-live') ?? 'polite').toBe('polite')
    expect(status().textContent).toBe('')
    withState(B, 'offline')
    expect(status().textContent).toBe('Pharmacy: You’re offline')
    withState(B, 'loading')
    expect(status().textContent).toBe('Pharmacy: You’re offline')
    withState(B, 'ready')
    expect(status().textContent).toBe('Pharmacy: connected')
    // a plain switch to a healthy account says nothing; to a broken one, what is wrong
    setSnap({ activeId: A })
    expect(status().textContent).toBe('')
    withState(D, 'failed', { activeId: D })
    expect(status().textContent).toBe('محمد يوسف: WhatsApp didn’t load')
  })
})

describe('Stage: empty state', () => {
  test('no accounts: a welcome inside <main>, no context bar, no webviews', async () => {
    setSnap({ accounts: [], runtime: {}, activeId: null })
    render(<Stage />)
    const main = screen.getByRole('main')
    expect(within(main).getByRole('heading', { name: 'Welcome to Diwan' })).toBeTruthy()
    expect(screen.queryByRole('banner')).toBeNull()
    expect(webviews()).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Import from Nexus' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Add account' }))
    expect(useUi.getState().dialog).toEqual({ kind: 'add' })
  })

  test('offers the Nexus import when available; recovery mode disables both', async () => {
    setSnap({ accounts: [], runtime: {}, activeId: null, importAvailable: true })
    render(<Stage />)
    await userEvent.click(screen.getByRole('button', { name: 'Import from Nexus' }))
    expect(useUi.getState().dialog).toEqual({ kind: 'import' })
    setSnap({ accounts: [], runtime: {}, activeId: null, importAvailable: true, recovery: true })
    expect((screen.getByRole('button', { name: 'Add account' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Import from Nexus' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
  })

  test('before the first snapshot: an empty, still focusable main', () => {
    render(<Stage />)
    expect(screen.getByRole('main').getAttribute('tabindex')).toBe('-1')
    expect(screen.queryByRole('heading')).toBeNull()
  })
})

describe('ContextBar', () => {
  const bar = () => screen.getByRole('banner')

  test('renders nothing without an active account', () => {
    setSnap({ activeId: null })
    const { container } = render(<ContextBar />)
    expect(container.innerHTML).toBe('')
  })

  test('colour dot, name in its own direction, connected state; the bar drags the window', () => {
    setSnap()
    render(<ContextBar />)
    const name = within(bar()).getByRole('heading', { level: 1, name: 'Pharmacy' })
    expect(name.getAttribute('dir')).toBe('auto')
    expect(name.className).toContain('bidi-plain')
    expect(screen.getByTestId('connection').textContent).toBe('Connected')
    expect(bar().className).toContain('drag')
    for (const b of within(bar()).getAllByRole('button')) expect(b.className).toContain('no-drag')
  })

  test.each([
    ['loading', 'Connecting…', 'bg-fg-mute'],
    ['ready', 'Connected', 'bg-ok'],
    ['offline', 'Offline', 'bg-warn'],
    ['failed', 'Didn’t load', 'bg-danger'],
    ['hung', 'Not responding', 'bg-warn'],
    ['loggingOut', 'Logging out…', 'bg-fg-mute'],
  ] as const)('%s → "%s" with a %s dot', (state, label, dot) => {
    withState(B, state)
    render(<ContextBar />)
    expect(screen.getByTestId('connection').textContent).toBe(label)
    expect(screen.getByTestId('connection').querySelector('span')?.className).toContain(dot)
  })

  test('a muted account shows the Muted tag and an Unmute button', async () => {
    setSnap({ activeId: C })
    render(<ContextBar />)
    expect(within(bar()).getByText('Muted')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Unmute notifications for Family' }))
    expect(invoke).toHaveBeenCalledWith('account:update', { id: C, patch: { muted: false } })
  })

  test('mute, reload and more are labelled with the account name', async () => {
    setSnap({ activeId: D })
    render(<ContextBar />)
    expect(within(bar()).queryByText('Muted')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Mute notifications for محمد يوسف' }))
    expect(invoke).toHaveBeenCalledWith('account:update', { id: D, patch: { muted: true } })
    await userEvent.click(screen.getByRole('button', { name: 'Reload محمد يوسف' }))
    expect(invoke).toHaveBeenCalledWith('account:reload', { id: D })
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(useUi.getState().menu?.id).toBe(D)
  })

  test('Inbox: total unread of unmuted accounts in its name; goes to the next account with unread', async () => {
    setSnap({
      runtime: { [A]: rt(), [B]: rt({ unread: 12 }), [C]: rt({ unread: 3 }), [D]: rt({ unread: 2 }) },
    })
    render(<ContextBar />)
    const inbox = screen.getByRole('button', { name: 'Inbox, 14 unread' })
    expect(screen.getByTestId('inbox-count').textContent).toBe('14')
    expect(screen.getByTestId('inbox-count').className).toContain('bg-accent-strong')
    expect(inbox.hasAttribute('aria-disabled')).toBe(false)
    await userEvent.click(inbox)
    expect(invoke).toHaveBeenCalledWith('account:activate', { id: D })
  })

  test('Inbox with nothing elsewhere: still focusable, aria-disabled, does nothing', async () => {
    setSnap({ runtime: { [A]: rt(), [B]: rt(), [C]: rt({ unread: 3 }), [D]: rt() } })
    render(<ContextBar />)
    const inbox = screen.getByRole('button', { name: 'Inbox, no unread messages' })
    expect(inbox.getAttribute('aria-disabled')).toBe('true')
    expect(screen.queryByTestId('inbox-count')).toBeNull()
    await userEvent.click(inbox)
    expect(invoke).not.toHaveBeenCalled()
  })

  test('zoom shows 100% in mono; any other level is a reset button', async () => {
    setSnap()
    const { unmount } = render(<ContextBar />)
    expect(within(bar()).getByText('100%').className).toContain('font-mono')
    expect(screen.queryByRole('button', { name: /^Zoom/ })).toBeNull()
    unmount()
    const s = snapshot()
    setSnap({ accounts: s.accounts.map((a) => (a.id === B ? { ...a, zoom: 2 } : a)) })
    render(<ContextBar />)
    const zoom = screen.getByRole('button', { name: 'Zoom 144%, reset to 100%' })
    expect(zoom.className).toContain('font-mono')
    await userEvent.click(zoom)
    expect(invoke).toHaveBeenCalledWith('account:zoom', { id: B, delta: 0 })
  })

  test('helpers: zoom percent and the next unread account (wraps, skips muted and the active one)', () => {
    expect([-1, 0, 1, 5].map(zoomPercent)).toEqual([83, 100, 120, 249])
    const s = snapshot()
    expect(nextUnread(s.accounts, s.runtime, B)).toBeNull()
    expect(nextUnread(s.accounts, s.runtime, D)).toBe(B)
    expect(nextUnread(s.accounts, s.runtime, null)).toBe(B)
    expect(nextUnread([], {}, null)).toBeNull()
  })
})

describe('RecoveryBanner', () => {
  test('hidden unless in recovery mode', () => {
    setSnap()
    const { container } = render(<RecoveryBanner />)
    expect(container.innerHTML).toBe('')
  })

  test('an alert with Open folder and a confirmed Start fresh', async () => {
    setSnap({ recovery: true })
    render(<RecoveryBanner />)
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('settings file is damaged')
    await userEvent.click(within(alert).getByRole('button', { name: 'Open folder' }))
    expect(invoke).toHaveBeenCalledWith('app:openDataFolder', undefined)
    await userEvent.click(within(alert).getByRole('button', { name: 'Start fresh' }))
    const d = useUi.getState().dialog
    expect(d?.kind).toBe('confirm')
    expect(invoke).not.toHaveBeenCalledWith('app:startFresh', undefined)
    if (d?.kind === 'confirm') act(() => d.onConfirm())
    expect(invoke).toHaveBeenCalledWith('app:startFresh', undefined)
  })
})

describe('WindowControls', () => {
  test('hidden unless "Show window controls" is on', () => {
    setSnap()
    const { container } = render(<WindowControls />)
    expect(container.innerHTML).toBe('')
  })

  test('minimize, maximize and close go through main', async () => {
    setSnap({ settings: { showWindowControls: true } as Snapshot['settings'] })
    render(<WindowControls />)
    for (const [name, channel] of [
      ['Minimize', 'window:minimize'],
      ['Maximize', 'window:toggleMaximize'],
      ['Close', 'window:close'],
    ] as const) {
      const b = screen.getByRole('button', { name })
      expect(b.className).toContain('no-drag')
      await userEvent.click(b)
      expect(invoke).toHaveBeenCalledWith(channel, undefined)
    }
  })
})
