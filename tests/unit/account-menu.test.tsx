// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { AccountMenu, isolate, placeMenu, typeaheadIndex } from '../../src/renderer/components/AccountMenu'
import { ContextBar } from '../../src/renderer/components/ContextBar'
import { Dialogs } from '../../src/renderer/components/Dialogs'
import { Rail } from '../../src/renderer/components/Rail'
import { useUi } from '../../src/renderer/state'
import type { Account, AccountRuntime, Snapshot } from '../../src/shared/types'

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
const rt = (extra: Partial<AccountRuntime> = {}): AccountRuntime => ({
  state: 'ready',
  unread: 0,
  avatar: null,
  ...extra,
})

function snapshot(over: Partial<Snapshot> = {}): Snapshot {
  return {
    accounts: [
      account('a', 'Personal'),
      account('b', 'Pharmacy', { color: '#0d9488', customAvatar: true }),
      account('c', 'Family', { muted: true }),
      account('d', 'محمد يوسف'),
    ],
    runtime: { a: rt(), b: rt(), c: rt(), d: rt() },
    activeId: 'b',
    settings: {} as Snapshot['settings'],
    recovery: false,
    importAvailable: false,
    trayAvailable: true,
    platform: 'linux',
    dataDir: '/home/u/.config/Diwan',
    ...over,
  }
}

const LABELS = [
  'Edit name and colour…',
  'Change picture…',
  'Mute notifications',
  'Reload',
  'Log out…',
  'Remove account…',
]

// Rail + stage + menu + dialogs, the way the app lays them out.
function App() {
  return (
    <>
      <Rail />
      <main>
        <ContextBar />
        <button type="button">outside</button>
      </main>
      <AccountMenu />
      <Dialogs />
    </>
  )
}

function show(over: Partial<Snapshot> = {}) {
  act(() => useUi.getState().setSnap(snapshot(over)))
  return render(<App />)
}

const tile = (name: RegExp) => screen.getByRole('button', { name })
const item = (name: string | RegExp) => screen.getByRole('menuitem', { name })
const items = () => screen.getAllByRole('menuitem').map((el) => el.textContent)

// Focus the tile, then open its menu the way a right-click does.
function openOn(name: RegExp, at = { clientX: 30, clientY: 200 }) {
  const t = tile(name)
  t.focus()
  fireEvent.contextMenu(t, at)
  return t
}

beforeEach(() => {
  useUi.setState(initial, true)
  invoke.mockReset()
  invoke.mockResolvedValue(undefined)
  window.diwan = { invoke } as unknown as Window['diwan']
})
afterEach(() => {
  cleanup()
})

describe('AccountMenu', () => {
  test('renders nothing while closed', () => {
    act(() => useUi.getState().setSnap(snapshot()))
    const { container } = render(<AccountMenu />)
    expect(container.innerHTML).toBe('')
  })

  test('is a labelled menu of menuitems, and the first item has focus', () => {
    show()
    openOn(/^Personal/)
    const menu = screen.getByRole('menu', { name: 'Actions for Personal' })
    expect(menu).toBeTruthy()
    expect(items()).toEqual(LABELS)
    expect(document.activeElement).toBe(item('Edit name and colour…'))
    // the log-out group is set apart by a separator inside the menu
    expect(screen.getAllByRole('separator')).toHaveLength(1)
  })

  test('the account name in the header follows its own direction (Arabic)', () => {
    show()
    openOn(/^محمد/)
    const name = screen.getByTestId('account-menu').querySelector('.bidi-plain')
    expect(name?.textContent).toBe('محمد يوسف')
    expect(name?.getAttribute('dir')).toBe('auto')
  })

  test('a custom picture adds "Use WhatsApp picture"; a muted account offers Unmute', () => {
    show()
    openOn(/^Pharmacy/)
    expect(items()).toContain('Use WhatsApp picture')
    act(() => useUi.getState().openMenu(null))
    openOn(/^Family/)
    expect(items()).toContain('Unmute notifications')
    expect(items()).not.toContain('Mute notifications')
  })

  test('↑/↓ move and wrap, Home and End jump', async () => {
    const user = userEvent.setup()
    show()
    openOn(/^Personal/)
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(item('Change picture…'))
    await user.keyboard('{ArrowUp}{ArrowUp}')
    expect(document.activeElement).toBe(item('Remove account…'))
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(item('Edit name and colour…'))
    await user.keyboard('{End}')
    expect(document.activeElement).toBe(item('Remove account…'))
    await user.keyboard('{Home}')
    expect(document.activeElement).toBe(item('Edit name and colour…'))
  })

  test('typeahead: a letter jumps to the next match, the same letter again cycles', async () => {
    const user = userEvent.setup()
    show()
    openOn(/^Personal/)
    await user.keyboard('r')
    expect(document.activeElement).toBe(item('Reload'))
    await user.keyboard('r')
    expect(document.activeElement).toBe(item('Remove account…'))
    // letters typed close together are one search ("rrm" matches nothing, so focus stays)
    await user.keyboard('m')
    expect(document.activeElement).toBe(item('Remove account…'))
    expect(invoke).not.toHaveBeenCalled()
  })

  test('typeahead: a pause starts a new search; several letters match a longer prefix', async () => {
    const user = userEvent.setup()
    let now = 1000
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now)
    try {
      show()
      openOn(/^Personal/)
      await user.keyboard('lo')
      expect(document.activeElement).toBe(item('Log out…'))
      now += 2000
      await user.keyboard('m')
      expect(document.activeElement).toBe(item('Mute notifications'))
    } finally {
      clock.mockRestore()
    }
  })

  test('typeaheadIndex', () => {
    const labels = ['Edit', 'Reload', 'Log out', 'Remove']
    expect(typeaheadIndex(labels, 0, 'r')).toBe(1)
    expect(typeaheadIndex(labels, 1, 'rr')).toBe(3)
    expect(typeaheadIndex(labels, 3, 'r')).toBe(1) // wraps
    expect(typeaheadIndex(labels, 1, 'rem')).toBe(3)
    expect(typeaheadIndex(labels, 0, 'lo')).toBe(2)
    expect(typeaheadIndex(labels, 0, 'z')).toBe(-1)
  })

  test('Esc closes it and focus goes back to the tile', async () => {
    const user = userEvent.setup()
    show()
    const t = openOn(/^Family/)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(t)
  })

  test('Tab closes it and focus goes back to the tile', async () => {
    const user = userEvent.setup()
    show()
    const t = openOn(/^Family/)
    await user.tab()
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(t)
  })

  test('a click outside closes it', () => {
    show()
    openOn(/^Family/)
    fireEvent.mouseDown(item('Reload'))
    expect(screen.queryByRole('menu')).not.toBeNull()
    fireEvent.mouseDown(screen.getByRole('button', { name: 'outside' }))
    expect(screen.queryByRole('menu')).toBeNull()
  })

  test('focus leaving it (into WhatsApp, another window) closes it', () => {
    show()
    openOn(/^Family/)
    act(() => screen.getByRole('button', { name: 'outside' }).focus())
    expect(screen.queryByRole('menu')).toBeNull()
    openOn(/^Family/)
    act(() => {
      window.dispatchEvent(new Event('blur'))
    })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  test('opened from the context bar "More": Esc gives focus back to that button', async () => {
    const user = userEvent.setup()
    show()
    const more = screen.getByRole('button', { name: 'More actions' })
    await user.click(more)
    expect(screen.getByRole('menu', { name: 'Actions for Pharmacy' })).toBeTruthy()
    expect(document.activeElement).toBe(item('Edit name and colour…'))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(more)
  })

  test('stays inside the window', () => {
    show()
    const box = () => screen.getByTestId('account-menu')
    const rect = Element.prototype.getBoundingClientRect
    Element.prototype.getBoundingClientRect = function (this: Element) {
      return (this as HTMLElement).dataset.testid === 'account-menu'
        ? ({ width: 228, height: 260, top: 0, left: 0, right: 228, bottom: 260 } as DOMRect)
        : rect.call(this)
    }
    try {
      openOn(/^Family/, { clientX: 1000, clientY: 700 }) // jsdom window: 1024 × 768
      expect(box().style.left).toBe(`${1024 - 228 - 8}px`)
      expect(box().style.top).toBe(`${700 - 260}px`) // opens upwards
    } finally {
      Element.prototype.getBoundingClientRect = rect
    }
  })

  test('opened by keyboard near the bottom: flips up so it ends at the tile’s bottom, not over it', () => {
    show()
    const t = tile(/^Family/)
    t.getBoundingClientRect = () => ({ top: 600, bottom: 644, left: 12, right: 56 }) as DOMRect
    const rect = Element.prototype.getBoundingClientRect
    Element.prototype.getBoundingClientRect = function (this: Element) {
      return (this as HTMLElement).dataset.testid === 'account-menu'
        ? ({ width: 228, height: 260, top: 0, left: 0, right: 228, bottom: 260 } as DOMRect)
        : rect.call(this)
    }
    try {
      t.focus()
      fireEvent.keyDown(t, { key: 'F10', shiftKey: true })
      fireEvent.contextMenu(t, { clientX: 34, clientY: 622 })
      expect(useUi.getState().menu).toEqual({ id: 'c', x: 64, y: 600, flipY: 644 })
      expect(screen.getByTestId('account-menu').style.top).toBe(`${644 - 260}px`)
    } finally {
      Element.prototype.getBoundingClientRect = rect
    }
  })

  test('a press on the header or padding keeps focus in the menu (it doesn’t blur-close)', () => {
    show()
    openOn(/^Family/)
    const header = screen.getByTestId('account-menu').firstElementChild as HTMLElement
    expect(fireEvent.mouseDown(header)).toBe(false) // default prevented: focus doesn't move
    expect(fireEvent.mouseDown(screen.getByTestId('account-menu'))).toBe(false)
    expect(fireEvent.mouseDown(item('Reload'))).toBe(true) // items still take focus
    expect(screen.getByRole('menu')).toBeTruthy()
  })

  test('placeMenu', () => {
    expect(placeMenu(100, 100, 228, 260, 1024, 768)).toEqual({ left: 100, top: 100 })
    expect(placeMenu(1000, 100, 228, 260, 1024, 768)).toEqual({ left: 788, top: 100 })
    expect(placeMenu(100, 700, 228, 260, 1024, 768)).toEqual({ left: 100, top: 440 })
    // flipY: a menu beside a tile ends at the tile's bottom
    expect(placeMenu(64, 600, 228, 260, 1024, 768, 644)).toEqual({ left: 64, top: 384 })
    expect(placeMenu(64, 100, 228, 260, 1024, 768, 144)).toEqual({ left: 64, top: 100 }) // fits below
    // taller than the room above and below: pinned to the bottom edge, never above the top
    expect(placeMenu(-50, 300, 228, 600, 1024, 500)).toEqual({ left: 8, top: 8 })
    expect(placeMenu(10, 400, 228, 300, 1024, 600)).toEqual({ left: 10, top: 100 })
  })
})

describe('AccountMenu actions', () => {
  const run = async (tileName: RegExp, label: string) => {
    const user = userEvent.setup()
    show()
    openOn(tileName)
    await user.click(item(label))
    expect(screen.queryByRole('menu')).toBeNull()
    return user
  }

  test.each<[RegExp, string, string, unknown]>([
    [/^Personal/, 'Change picture…', 'account:pickAvatar', { id: 'a' }],
    [/^Pharmacy/, 'Use WhatsApp picture', 'account:clearAvatar', { id: 'b' }],
    [/^Personal/, 'Mute notifications', 'account:update', { id: 'a', patch: { muted: true } }],
    [/^Family/, 'Unmute notifications', 'account:update', { id: 'c', patch: { muted: false } }],
    [/^Personal/, 'Reload', 'account:reload', { id: 'a' }],
  ])('%s → %s calls %s', async (name, label, channel, payload) => {
    await run(name, label)
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(invoke).toHaveBeenCalledWith(channel, payload)
  })

  test('Enter on a focused item activates it', async () => {
    const user = userEvent.setup()
    show()
    openOn(/^Personal/)
    await user.keyboard('{End}{ArrowUp}{ArrowUp}{Enter}')
    expect(invoke).toHaveBeenCalledWith('account:reload', { id: 'a' })
  })

  test('Edit opens the edit dialog for that account', async () => {
    await run(/^Family/, 'Edit name and colour…')
    expect(useUi.getState().dialog).toEqual({ kind: 'edit', id: 'c' })
    expect(screen.getByRole('dialog', { name: 'Edit account' })).toBeTruthy()
    expect((screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement).value).toBe('Family')
  })

  test('Log out asks first, with the account id; confirming logs out', async () => {
    const user = await run(/^محمد/, 'Log out…')
    const d = useUi.getState().dialog
    expect(d).toMatchObject({ kind: 'confirm', accountId: 'd', danger: false, confirmLabel: 'Log out' })
    expect(screen.getByRole('dialog', { name: `Log out of “${isolate('محمد يوسف')}”?` })).toBeTruthy()
    expect(invoke).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Log out' }))
    expect(invoke).toHaveBeenCalledWith('account:logout', { id: 'd' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test('Remove asks first (danger), with the account id; Cancel does nothing', async () => {
    const user = await run(/^Family/, 'Remove account…')
    expect(useUi.getState().dialog).toMatchObject({ kind: 'confirm', accountId: 'c', danger: true })
    // Cancel has the initial focus, so a stray Enter can't remove anything
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }))
    await user.keyboard('{Enter}')
    expect(invoke).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test('Remove → confirm calls account:remove', async () => {
    const user = await run(/^Family/, 'Remove account…')
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    expect(invoke).toHaveBeenCalledWith('account:remove', { id: 'c' })
  })

  test('the confirmation closes itself when its account disappears', async () => {
    await run(/^Family/, 'Remove account…')
    act(() => {
      const s = snapshot()
      useUi.getState().setSnap({ ...s, accounts: s.accounts.filter((a) => a.id !== 'c') })
    })
    expect(useUi.getState().dialog).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
    // focus lands on the active tile, not <body>
    expect(document.activeElement).toBe(tile(/^Pharmacy/))
  })

  test('after Remove, focus moves to the tile that took its place, never <body>', async () => {
    const user = await run(/^Family/, 'Remove account…')
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    expect(document.activeElement).toBe(tile(/^Family/)) // the confirm handed focus back
    act(() => {
      const s = snapshot()
      useUi.getState().setSnap({ ...s, accounts: s.accounts.filter((a) => a.id !== 'c') })
    })
    expect(document.activeElement).toBe(tile(/^محمد/))
  })

  test('removing the last tile in the rail: focus goes to the one before it', async () => {
    const user = await run(/^محمد/, 'Remove account…')
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    act(() => {
      const s = snapshot()
      useUi.getState().setSnap({ ...s, accounts: s.accounts.filter((a) => a.id !== 'd') })
    })
    expect(document.activeElement).toBe(tile(/^Family/))
  })

  test('removing the only account: focus goes to <main>', async () => {
    const user = await run(/^Personal/, 'Remove account…')
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    act(() => useUi.getState().setSnap(snapshot({ accounts: [], runtime: {}, activeId: null })))
    expect(document.activeElement).toBe(screen.getByRole('main'))
  })

  test('an account removed elsewhere doesn’t steal focus from where it is', () => {
    show()
    const outside = screen.getByRole('button', { name: 'outside' })
    outside.focus()
    act(() => {
      const s = snapshot()
      useUi.getState().setSnap({ ...s, accounts: s.accounts.filter((a) => a.id !== 'c') })
    })
    expect(document.activeElement).toBe(outside)
  })

  test('in recovery mode, items that change settings are disabled and do nothing', async () => {
    const user = userEvent.setup()
    show({ recovery: true })
    openOn(/^Pharmacy/)
    for (const label of [
      'Edit name and colour…',
      'Change picture…',
      'Use WhatsApp picture',
      'Mute notifications',
      'Remove account…',
    ])
      expect(item(label).getAttribute('aria-disabled')).toBe('true')
    expect(item('Reload').hasAttribute('aria-disabled')).toBe(false)
    await user.click(item('Remove account…'))
    expect(useUi.getState().dialog).toBeNull()
    expect(invoke).not.toHaveBeenCalled()
  })

  test('Log out is disabled while the account is already logging out', () => {
    show({ runtime: { a: rt({ state: 'loggingOut' }), b: rt(), c: rt(), d: rt() } })
    openOn(/^Personal/)
    expect(item('Log out…').getAttribute('aria-disabled')).toBe('true')
  })
})

describe('focus after a dialog opened from the menu', () => {
  test.each(['Edit name and colour…', 'Log out…', 'Remove account…'])(
    'tile → menu → %s → Esc focuses that tile again',
    async (label) => {
      const user = userEvent.setup()
      show()
      const t = openOn(/^Family/)
      await user.keyboard(`{End}`)
      item(label).focus()
      await user.keyboard('{Enter}')
      expect(screen.getByRole('dialog')).toBeTruthy()
      await user.keyboard('{Escape}')
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(document.activeElement).toBe(t)
    },
  )

  test('opened by right-click with focus elsewhere: the dialog still returns to that tile', async () => {
    const user = userEvent.setup()
    show()
    // focus is on <body> (say, it was in WhatsApp): the menu's opener isn't the tile
    fireEvent.contextMenu(tile(/^Family/), { clientX: 30, clientY: 200 })
    await user.click(item('Edit name and colour…'))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(document.activeElement).toBe(tile(/^Family/))
  })
})
