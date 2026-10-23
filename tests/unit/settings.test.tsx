// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import pkg from '../../package.json'
import { AccountMenu } from '../../src/renderer/components/AccountMenu'
import { Dialogs } from '../../src/renderer/components/Dialogs'
import { RAIL_SHORTCUTS, SettingsPage, windowShortcuts } from '../../src/renderer/settings/SettingsPage'
import { type SettingsSection, useUi } from '../../src/renderer/state'
import type { Account, Settings, Snapshot } from '../../src/shared/types'

const initial = useUi.getState()
const invoke = vi.fn()

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

const SETTINGS: Settings = {
  closeToTray: true,
  startHidden: false,
  showWindowControls: false,
  notifications: { enabled: true, sound: true, showPreview: true, markUrgent: false },
  window: { bounds: null, maximized: false },
}

function snapshot(over: Partial<Snapshot> = {}): Snapshot {
  return {
    accounts: [account('a', 'Personal'), account('b', 'صيدلية', { color: '#0d9488', muted: true })],
    runtime: {},
    activeId: 'a',
    settings: SETTINGS,
    recovery: false,
    importAvailable: true,
    trayAvailable: true,
    platform: 'linux',
    dataDir: '/home/u/.config/Diwan',
    ...over,
  }
}

function setSnap(over: Partial<Snapshot> = {}) {
  act(() => useUi.getState().setSnap(snapshot(over)))
}

// The settings page next to the layers that open over it, plus controls under it: one to open it
// from and a stand-in for the (covered) rail's active tile.
function App() {
  return (
    <>
      <button type="button" onClick={() => useUi.getState().openSettings()}>
        Opener
      </button>
      <button type="button" data-account-tile="a" data-active-tile="">
        Rail tile
      </button>
      <SettingsPage />
      <Dialogs />
      <AccountMenu />
    </>
  )
}

function openAt(section: SettingsSection, over: Partial<Snapshot> = {}) {
  setSnap(over)
  const r = render(<App />)
  screen.getByRole('button', { name: 'Opener' }).focus()
  act(() => useUi.getState().openSettings(section))
  return r
}

const page = () => screen.getByRole('dialog', { name: 'Settings' })
const sw = (name: string) => screen.getByRole('switch', { name })
const navItem = (name: string) =>
  within(screen.getByRole('navigation', { name: 'Settings sections' })).getByRole('button', { name })
const esc = () => fireEvent.keyDown(window, { key: 'Escape' })
const mainError = (channel: string, msg: string) =>
  new Error(`Error invoking remote method '${channel}': Error: ${msg}`)

beforeEach(() => {
  useUi.setState(initial, true)
  invoke.mockReset()
  invoke.mockResolvedValue(undefined)
  window.diwan = { invoke, onCommand: () => () => {} } as unknown as Window['diwan']
})
afterEach(() => {
  cleanup()
})

describe('opening, closing and focus', () => {
  test('renders nothing until opened, then a modal dialog named Settings that covers the window', () => {
    setSnap()
    render(<App />)
    expect(screen.queryByRole('dialog')).toBeNull()
    act(() => useUi.getState().openSettings())
    expect(page().getAttribute('aria-modal')).toBe('true')
    expect(page().className).toContain('fixed inset-x-0 bottom-0')
    expect(page().className).toContain('top-0')
  })

  test('with window controls on, it starts below their bar, and its title row drags the window', () => {
    setSnap({ settings: { ...SETTINGS, showWindowControls: true } })
    render(<App />)
    act(() => useUi.getState().openSettings())
    expect(page().className).toContain('top-8')
    expect(page().className).not.toContain('top-0')
    expect(screen.getByRole('heading', { name: 'Settings' }).className).toContain('drag')
  })

  test('focus moves to the current section on open and back to the opener on close', async () => {
    const user = userEvent.setup()
    openAt('notifications')
    expect(document.activeElement).toBe(navItem('Notifications'))
    await user.click(screen.getByRole('button', { name: 'Close settings' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(useUi.getState().settingsOpen).toBe(false)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Opener' }))
  })

  test('Esc closes it and hands focus back', () => {
    openAt('general')
    esc()
    expect(useUi.getState().settingsOpen).toBe(false)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Opener' }))
  })

  test('the close button shows Esc as a left-to-right key chip', () => {
    openAt('general')
    const close = screen.getByRole('button', { name: 'Close settings' })
    expect(close.getAttribute('aria-keyshortcuts')).toBe('Escape')
    const kbd = close.querySelector('kbd')
    expect(kbd?.textContent).toBe('Esc')
    expect(kbd?.getAttribute('dir')).toBe('ltr')
  })

  test('Tab and Shift+Tab stay inside the page', async () => {
    const user = userEvent.setup()
    openAt('about')
    const close = screen.getByRole('button', { name: 'Close settings' })
    const lastButton = screen.getAllByRole('button', { name: 'Open the data folder' }).at(-1) as HTMLElement
    lastButton.focus()
    await user.tab()
    expect(document.activeElement).toBe(navItem('General'))
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(lastButton)
    close.focus()
    expect(page().contains(document.activeElement)).toBe(true)
  })

  test('shows the version at the foot of the nav', () => {
    openAt('general')
    expect(screen.getByText(`Diwan ${pkg.version}`)).toBeTruthy()
  })
})

describe('sections', () => {
  test('the nav is a list of buttons with aria-current on the open section', async () => {
    const user = userEvent.setup()
    openAt('general')
    const nav = screen.getByRole('navigation', { name: 'Settings sections' })
    const items = within(nav).getAllByRole('button')
    expect(within(nav).getAllByRole('listitem')).toHaveLength(6)
    expect(items.map((b) => b.textContent)).toEqual([
      'General',
      'Notifications',
      'Accounts',
      'Data',
      'Shortcuts',
      'About',
    ])
    expect(navItem('General').getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('heading', { level: 2, name: 'General' })).toBeTruthy()

    await user.click(navItem('Notifications'))
    expect(useUi.getState().section).toBe('notifications')
    expect(navItem('Notifications').getAttribute('aria-current')).toBe('page')
    expect(navItem('General').hasAttribute('aria-current')).toBe(false)
    expect(screen.getByRole('heading', { level: 2, name: 'Notifications' })).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 2, name: 'General' })).toBeNull()
  })

  test('↑/↓ wrap and Home/End jump in the nav; Enter opens the focused section', async () => {
    const user = userEvent.setup()
    openAt('general')
    await user.keyboard('{ArrowUp}')
    expect(document.activeElement).toBe(navItem('About'))
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(navItem('General'))
    await user.keyboard('{End}')
    expect(document.activeElement).toBe(navItem('About'))
    await user.keyboard('{Home}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}')
    expect(document.activeElement).toBe(navItem('Shortcuts'))
    expect(useUi.getState().section).toBe('general') // moving focus doesn't open it
    await user.keyboard('{Enter}')
    expect(useUi.getState().section).toBe('shortcuts')
    expect(screen.getByRole('heading', { level: 2, name: 'Shortcuts' })).toBeTruthy()
  })
})

describe('toggles', () => {
  test.each([
    ['general', 'Close to tray', { closeToTray: false }],
    ['general', 'Start hidden', { startHidden: true }],
    ['general', 'Show window controls', { showWindowControls: true }],
    ['notifications', 'Show notifications', { notifications: { enabled: false } }],
    ['notifications', 'Play a sound', { notifications: { sound: false } }],
    ['notifications', 'Show message text', { notifications: { showPreview: false } }],
    ['notifications', 'Mark the window as urgent', { notifications: { markUrgent: true } }],
  ] as const)('%s → %s sends %j', async (section, name, patch) => {
    const user = userEvent.setup()
    openAt(section)
    await user.click(sw(name))
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(invoke).toHaveBeenCalledWith('settings:update', patch)
  })

  test('each row is one switch, named by its title and described by its hint', () => {
    openAt('notifications')
    const s = sw('Play a sound')
    const hint = document.getElementById(s.getAttribute('aria-describedby') ?? '')
    expect(hint?.textContent).toBe('Uses the system notification sound.')
    expect(s.closest('label')?.htmlFor).toBe(s.id)
    expect(screen.getAllByRole('switch')).toHaveLength(4 + 2) // four options + two accounts
  })

  test('a click anywhere on the row toggles, once', async () => {
    const user = userEvent.setup()
    openAt('notifications')
    await user.click(screen.getByText('Uses the system notification sound.'))
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(invoke).toHaveBeenCalledWith('settings:update', { notifications: { sound: false } })
  })

  test('Space toggles the focused switch', async () => {
    const user = userEvent.setup()
    openAt('notifications')
    sw('Mark the window as urgent').focus()
    await user.keyboard(' ')
    expect(invoke).toHaveBeenCalledWith('settings:update', { notifications: { markUrgent: true } })
  })

  test('switches show the snapshot, not a local guess', async () => {
    const user = userEvent.setup()
    openAt('notifications')
    expect(sw('Show notifications').getAttribute('aria-checked')).toBe('true')
    expect(sw('Mark the window as urgent').getAttribute('aria-checked')).toBe('false')
    await user.click(sw('Show notifications'))
    // main hasn't answered with a new snapshot: the switch still says what main has
    expect(sw('Show notifications').getAttribute('aria-checked')).toBe('true')
    setSnap({ settings: { ...SETTINGS, notifications: { ...SETTINGS.notifications, enabled: false } } })
    expect(sw('Show notifications').getAttribute('aria-checked')).toBe('false')
  })

  test('an error from main becomes an error toast', async () => {
    const user = userEvent.setup()
    invoke.mockRejectedValue(
      mainError('settings:update', 'settings are in recovery mode and cannot be changed'),
    )
    openAt('general')
    await user.click(sw('Show window controls'))
    expect(useUi.getState().toasts).toEqual([
      expect.objectContaining({ text: 'settings are in recovery mode and cannot be changed', error: true }),
    ])
  })

  test('without a tray, the tray options are off-limits and say why', () => {
    openAt('general', { trayAvailable: false })
    expect((sw('Close to tray') as HTMLButtonElement).disabled).toBe(true)
    expect((sw('Start hidden') as HTMLButtonElement).disabled).toBe(true)
    expect((sw('Show window controls') as HTMLButtonElement).disabled).toBe(false)
    const hint = document.getElementById(sw('Close to tray').getAttribute('aria-describedby') ?? '')
    expect(hint?.textContent).toMatch(/no system tray/)
  })
})

describe('per account', () => {
  test('lists every account with its state; names follow their own direction', () => {
    openAt('notifications')
    const group = screen.getByRole('region', { name: 'Per-account notifications' })
    const name = within(group).getByText('صيدلية')
    expect(name.getAttribute('dir')).toBe('auto')
    expect(name.className).toContain('bidi-plain')
    expect(sw('Notifications for Personal').getAttribute('aria-checked')).toBe('true')
    expect(sw('Notifications for صيدلية').getAttribute('aria-checked')).toBe('false')
    expect(within(group).getByText('Muted')).toBeTruthy()
    expect(within(group).getByText('On')).toBeTruthy()
  })

  test('the switch mutes or unmutes through account:update', async () => {
    const user = userEvent.setup()
    openAt('notifications')
    await user.click(sw('Notifications for Personal'))
    expect(invoke).toHaveBeenLastCalledWith('account:update', { id: 'a', patch: { muted: true } })
    await user.click(sw('Notifications for صيدلية'))
    expect(invoke).toHaveBeenLastCalledWith('account:update', { id: 'b', patch: { muted: false } })
  })

  test('no accounts, no per-account list', () => {
    openAt('notifications', { accounts: [] })
    expect(screen.queryByRole('region', { name: 'Per-account notifications' })).toBeNull()
  })
})

describe('layers over settings', () => {
  test('Esc closes a dialog over settings first, then settings', async () => {
    const user = userEvent.setup()
    openAt('accounts')
    const edit = screen.getByRole('button', { name: 'Edit Personal' })
    await user.click(edit)
    expect(screen.getByRole('dialog', { name: 'Edit account' })).toBeTruthy()
    esc()
    expect(screen.queryByRole('dialog', { name: 'Edit account' })).toBeNull()
    expect(useUi.getState().settingsOpen).toBe(true)
    expect(document.activeElement).toBe(edit)
    esc()
    expect(useUi.getState().settingsOpen).toBe(false)
  })

  test('settings opened while a dialog is up still leaves the first Esc to the dialog', () => {
    setSnap()
    render(<App />)
    act(() => useUi.getState().openDialog({ kind: 'edit', id: 'a' }))
    act(() => useUi.getState().openSettings('general'))
    esc()
    expect(useUi.getState().dialog).toBeNull()
    expect(useUi.getState().settingsOpen).toBe(true)
    expect(page().contains(document.activeElement)).toBe(true)
    esc()
    expect(useUi.getState().settingsOpen).toBe(false)
  })

  test('opened under a dialog (Ctrl+,), it leaves focus and Tab in the dialog until that closes', async () => {
    const user = userEvent.setup()
    setSnap()
    render(<App />)
    act(() => useUi.getState().openDialog({ kind: 'edit', id: 'a' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit account' })
    expect(dialog.contains(document.activeElement)).toBe(true)
    const before = document.activeElement
    act(() => useUi.getState().openSettings('general'))
    expect(document.activeElement).toBe(before)
    for (let i = 0; i < 12; i++) {
      await user.tab()
      expect(dialog.contains(document.activeElement)).toBe(true)
    }
    await user.tab({ shift: true })
    expect(dialog.contains(document.activeElement)).toBe(true)
    esc()
    expect(page().contains(document.activeElement)).toBe(true)
  })

  test('the account menu over settings takes Esc first and gives focus back to its button', async () => {
    const user = userEvent.setup()
    openAt('accounts')
    const more = screen.getByRole('button', { name: 'More actions for Personal' })
    await user.click(more)
    expect(screen.getByRole('menu')).toBeTruthy()
    esc()
    expect(screen.queryByRole('menu')).toBeNull()
    expect(useUi.getState().settingsOpen).toBe(true)
    expect(document.activeElement).toBe(more)
  })

  test('a dialog opened from the menu hands focus back into settings, not to the covered rail', async () => {
    const user = userEvent.setup()
    openAt('accounts')
    const more = screen.getByRole('button', { name: 'More actions for Personal' })
    await user.click(more)
    await user.click(screen.getByRole('menuitem', { name: /Edit name/ }))
    expect(screen.getByRole('dialog', { name: 'Edit account' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(page().contains(document.activeElement)).toBe(true)
    expect(document.activeElement).toBe(more)
  })
})

describe('recovery mode', () => {
  test('every switch is disabled and the page says why', () => {
    openAt('notifications', { recovery: true })
    for (const s of screen.getAllByRole('switch')) expect((s as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/settings file is damaged, so changes can’t be saved/)).toBeTruthy()
  })

  test('account and import controls are disabled; Data offers Start fresh', async () => {
    const user = userEvent.setup()
    openAt('accounts', { recovery: true })
    expect((screen.getByRole('button', { name: 'Add account' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Edit Personal' }) as HTMLButtonElement).disabled).toBe(true)
    await user.click(navItem('Data'))
    expect((screen.getByRole('button', { name: 'Import from Nexus' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    await user.click(screen.getByRole('button', { name: 'Start fresh…' }))
    expect(screen.getByRole('dialog', { name: 'Start with fresh settings?' })).toBeTruthy()
  })
})

describe('shortcuts', () => {
  test('lists main’s shortcuts and the rail keys, each key a left-to-right chip', () => {
    openAt('shortcuts')
    const terms = screen.getAllByRole('term').map((t) => t.textContent)
    for (const s of [...windowShortcuts(true), ...RAIL_SHORTCUTS]) expect(terms).toContain(s.what)
    const row = (what: string) => {
      const dt = screen.getByText(what, { selector: 'dt' })
      return Array.from(dt.parentElement?.querySelectorAll('kbd') ?? [])
    }
    expect(row('Move the focused account up or down').map((k) => k.textContent)).toEqual(['Alt ↑', 'Alt ↓'])
    expect(row('Open the focused account’s menu').map((k) => k.textContent)).toEqual(['Shift F10', 'Menu'])
    expect(row('Next account').map((k) => k.textContent)).toEqual(['Ctrl Tab', 'Ctrl PgDn'])
    expect(row('Reload the account').map((k) => k.textContent)).toEqual(['Ctrl R', 'F5'])
    expect(row('Settings').map((k) => k.textContent)).toEqual(['Ctrl ,'])
    // Esc works anywhere, so it is listed with the window's keys, not under the rail.
    const esc = screen.getByText('Close Settings, a dialog or a menu', { selector: 'dt' })
    expect(esc.closest('dl')?.getAttribute('aria-label')).toBe('Anywhere in Diwan')
    for (const k of page().querySelectorAll('dd kbd')) expect(k.getAttribute('dir')).toBe('ltr')
  })

  test('Ctrl W says what it does on a desktop without a tray', () => {
    openAt('shortcuts', { trayAvailable: false })
    expect(screen.getByText('Minimize the window')).toBeTruthy()
    expect(screen.queryByText('Hide to tray')).toBeNull()
  })
})

describe('data and about', () => {
  test('Data opens the import dialog and the data folder', async () => {
    const user = userEvent.setup()
    openAt('data')
    await user.click(screen.getByRole('button', { name: 'Open the data folder' }))
    expect(invoke).toHaveBeenCalledWith('app:openDataFolder', undefined)
    invoke.mockResolvedValue({
      available: false,
      reason: 'Already imported',
      items: [],
      orphanDirs: 0,
      nexusRunning: false,
    })
    await user.click(screen.getByRole('button', { name: 'Import from Nexus' }))
    expect(useUi.getState().dialog).toEqual({ kind: 'import' })
  })

  test('About shows the version and opens the folder with the logs', async () => {
    const user = userEvent.setup()
    openAt('about')
    expect(screen.getByText(`Version ${pkg.version}`)).toBeTruthy()
    const open = screen.getByRole('button', { name: 'Open the data folder' })
    expect(document.getElementById(open.getAttribute('aria-describedby') ?? '')?.textContent).toMatch(/logs/)
    await user.click(open)
    expect(invoke).toHaveBeenCalledWith('app:openDataFolder', undefined)
  })
})
