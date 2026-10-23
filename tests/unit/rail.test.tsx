// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { moveId, Rail } from '../../src/renderer/components/Rail'
import { accountTile } from '../../src/renderer/focus'
import { useUi } from '../../src/renderer/state'
import { Dialog } from '../../src/renderer/ui/Dialog'
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
      account('b', 'Pharmacy', { color: '#0d9488' }),
      account('c', 'Family', { muted: true }),
      account('d', 'محمد يوسف'),
    ],
    runtime: {
      a: rt(),
      b: rt({ unread: 12 }),
      c: rt({ unread: 3 }),
      d: rt({ state: 'offline' }),
    },
    activeId: 'b',
    settings: {} as Snapshot['settings'],
    recovery: false,
    importAvailable: false,
    trayAvailable: true,
    ...over,
  }
}

function show(over: Partial<Snapshot> = {}) {
  act(() => useUi.getState().setSnap(snapshot(over)))
  return render(<Rail />)
}

const tile = (name: RegExp | string) => screen.getByRole('button', { name })
// The tile's wrapper holds its bar, pill and dot.
const box = (name: RegExp | string) => tile(name).parentElement?.parentElement as HTMLElement

beforeEach(() => {
  useUi.setState(initial, true)
  invoke.mockReset()
  invoke.mockResolvedValue(undefined)
  window.diwan = { invoke } as unknown as Window['diwan']
})
afterEach(() => {
  cleanup()
})

describe('Rail', () => {
  test('renders nothing before the first snapshot', () => {
    const { container } = render(<Rail />)
    expect(container.innerHTML).toBe('')
  })

  test('is a named nav with the logo, a tile per account, add and settings', () => {
    show()
    const nav = screen.getByRole('navigation', { name: 'Accounts' })
    expect(within(nav).getByRole('img', { name: 'Diwan' })).toBeTruthy()
    const buttons = within(nav).getAllByRole('button')
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Personal',
      'Pharmacy, 12 unread',
      'Family, 3 unread, muted',
      'محمد يوسف, offline',
      'Add account',
      'Settings',
    ])
  })

  test('the active tile has aria-current and the accent bar; others do not', () => {
    show()
    expect(tile(/^Pharmacy/).getAttribute('aria-current')).toBe('true')
    expect(tile(/^Personal/).hasAttribute('aria-current')).toBe(false)
    expect(tile(/^Pharmacy/).className).toContain('0_0_0_4px_var(--color-accent)')
    expect(tile(/^Personal/).className).toContain('opacity-[0.82]')
    expect(box(/^Pharmacy/).querySelector('.w-\\[3px\\]')).not.toBeNull()
    expect(box(/^Personal/).querySelector('.w-\\[3px\\]')).toBeNull()
  })

  test('tiles use the wide focus ring so focus never hides in the active ring', () => {
    show()
    for (const id of ['a', 'b', 'c', 'd']) {
      expect(document.querySelector(`[data-account-tile="${id}"]`)?.className).toContain('focus-ring-wide')
    }
  })

  test('unread pill: accent-strong normally, pill-muted when muted, 99+ above 99, none at 0', () => {
    show({
      runtime: {
        a: rt(),
        b: rt({ unread: 12 }),
        c: rt({ unread: 3 }),
        d: rt({ unread: 250, state: 'ready' }),
      },
    })
    const pill = (name: RegExp) => within(box(name)).queryByTestId('unread-pill')
    expect(pill(/^Personal/)).toBeNull()
    expect(pill(/^Pharmacy/)?.textContent).toBe('12')
    expect(pill(/^Pharmacy/)?.className).toContain('bg-accent-strong')
    expect(pill(/^Family/)?.className).toContain('bg-pill-muted')
    expect(pill(/^Family/)?.className).not.toContain('bg-accent-strong')
    expect(pill(/^محمد/)?.textContent).toBe('99+')
    // The name carries the real count; the pill is decoration.
    expect(tile(/^محمد/).getAttribute('aria-label')).toBe('محمد يوسف, 250 unread')
    expect(pill(/^Pharmacy/)?.getAttribute('aria-hidden')).toBe('true')
  })

  test('amber dot for offline, failed and hung, not for loading or ready', () => {
    show({
      runtime: {
        a: rt({ state: 'loading' }),
        b: rt({ state: 'failed' }),
        c: rt({ state: 'hung' }),
        d: rt({ state: 'offline' }),
      },
    })
    const dot = (name: RegExp) => within(box(name)).queryByTestId('offline-dot')
    expect(dot(/^Personal/)).toBeNull()
    expect(dot(/^Pharmacy/)?.className).toContain('bg-warn')
    expect(dot(/^Family/)).not.toBeNull()
    expect(dot(/^محمد/)).not.toBeNull()
    expect(tile(/^Pharmacy/).getAttribute('aria-label')).toBe('Pharmacy, failed to load')
    expect(tile(/^Family/).getAttribute('aria-label')).toBe('Family, muted, not responding')
  })

  test('a missing runtime entry renders as loading instead of crashing', () => {
    show({ runtime: {} })
    expect(tile('Personal')).toBeTruthy()
  })

  test('initials on the account colour, Arabic names in their own direction; avatar when present', () => {
    show({ runtime: { a: rt({ avatar: 'data:image/png;base64,AAAA' }), b: rt(), c: rt(), d: rt() } })
    expect(tile(/^Pharmacy/).style.background).toBe('rgb(13, 148, 136)')
    expect(tile(/^Pharmacy/).textContent).toBe('PH')
    const arabic = tile(/^محمد/).querySelector('span') as HTMLElement
    expect(arabic.textContent).toBe('مي')
    expect(arabic.getAttribute('dir')).toBe('auto')
    expect(arabic.className).toContain('bidi-plain')
    const img = tile(/^Personal/).querySelector('img') as HTMLImageElement
    expect(img.getAttribute('src')).toBe('data:image/png;base64,AAAA')
    expect(img.getAttribute('alt')).toBe('')
  })

  test('clicking a tile activates it through the api helper', async () => {
    const user = userEvent.setup()
    show()
    await user.click(tile(/^Family/))
    expect(invoke).toHaveBeenCalledWith('account:activate', { id: 'c' })
  })

  test('Enter on a focused tile activates it too', async () => {
    const user = userEvent.setup()
    show()
    tile(/^Personal/).focus()
    await user.keyboard('{Enter}')
    expect(invoke).toHaveBeenCalledWith('account:activate', { id: 'a' })
  })

  test('a failed activate becomes a toast, not an unhandled rejection', async () => {
    const user = userEvent.setup()
    invoke.mockRejectedValue(
      new Error("Error invoking remote method 'account:activate': Error: Unknown account"),
    )
    show()
    await user.click(tile(/^Personal/))
    expect(useUi.getState().toasts.map((t) => t.text)).toEqual(['Unknown account'])
  })

  test('add opens the add dialog; disabled in recovery mode', async () => {
    const user = userEvent.setup()
    show()
    await user.click(screen.getByRole('button', { name: 'Add account' }))
    expect(useUi.getState().dialog).toEqual({ kind: 'add' })
    cleanup()
    useUi.setState(initial, true)
    show({ recovery: true })
    expect((screen.getByRole('button', { name: 'Add account' }) as HTMLButtonElement).disabled).toBe(true)
  })

  test('settings opens the settings page', async () => {
    const user = userEvent.setup()
    show()
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    expect(useUi.getState().settingsOpen).toBe(true)
  })

  test('right-click opens the account menu at the pointer', () => {
    show()
    fireEvent.contextMenu(tile(/^Family/), { clientX: 30, clientY: 200 })
    expect(useUi.getState().menu).toEqual({ id: 'c', x: 30, y: 200 })
  })

  test('a keyboard context menu (no pointer position) opens beside the tile', () => {
    show()
    const t = tile(/^Family/)
    t.getBoundingClientRect = () => ({ top: 120, right: 56, left: 12, bottom: 164 }) as DOMRect
    fireEvent.contextMenu(t, { clientX: 0, clientY: 0 })
    expect(useUi.getState().menu).toEqual({ id: 'c', x: 64, y: 120 })
  })
})

describe('Rail tooltips', () => {
  test('keyboard focus shows the name and shortcut; the shortcut is the description', async () => {
    const user = userEvent.setup()
    show()
    expect(screen.queryByRole('tooltip')).toBeNull()
    await user.tab()
    expect(document.activeElement).toBe(tile(/^Personal/))
    const tip = screen.getByRole('tooltip')
    expect(tip.textContent).toBe('PersonalCtrl 1')
    expect(screen.getByRole('button', { name: 'Personal', description: 'Ctrl 1' })).toBe(tile(/^Personal/))
    await user.tab()
    expect(screen.getByRole('tooltip').textContent).toBe('PharmacyCtrl 2')
  })

  test('hover shows it, leaving hides it', async () => {
    const user = userEvent.setup()
    show()
    await user.hover(tile(/^محمد/))
    const tip = screen.getByRole('tooltip')
    expect(tip.textContent).toBe('محمد يوسفCtrl 4')
    const name = tip.querySelector('span') as HTMLElement
    expect(name.getAttribute('dir')).toBe('auto')
    expect(name.className).toContain('bidi-plain')
    await user.unhover(tile(/^محمد/))
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  test('Esc hides the tooltip of the focused tile', async () => {
    const user = userEvent.setup()
    show()
    await user.tab()
    expect(screen.getByRole('tooltip')).toBeTruthy()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  test('settings carries its shortcut; add has no description', () => {
    show()
    expect(screen.getByRole('button', { name: 'Settings', description: 'Ctrl ,' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add account' }).hasAttribute('aria-describedby')).toBe(false)
  })

  test('only the first nine tiles show a Ctrl shortcut', async () => {
    const user = userEvent.setup()
    const accounts = Array.from({ length: 10 }, (_, i) => account(`x${i}`, `Acc ${i}`))
    show({ accounts, runtime: {}, activeId: null })
    expect(screen.getByRole('button', { name: 'Acc 8' }).getAttribute('aria-describedby')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Acc 9' }).hasAttribute('aria-describedby')).toBe(false)
    await user.hover(screen.getByRole('button', { name: 'Acc 9' }))
    expect(screen.getByRole('tooltip').textContent).toBe('Acc 9')
  })
})

describe('Rail reordering', () => {
  test('moveId', () => {
    expect(moveId(['a', 'b', 'c'], 'a', 'c', 'after')).toEqual(['b', 'c', 'a'])
    expect(moveId(['a', 'b', 'c'], 'c', 'a', 'before')).toEqual(['c', 'a', 'b'])
    expect(moveId(['a', 'b', 'c'], 'b', 'b', 'after')).toEqual(['a', 'b', 'c'])
    expect(moveId(['a', 'b', 'c'], 'b', 'zz', 'after')).toEqual(['a', 'b', 'c'])
  })

  test('dragging a tile onto the lower half of another moves it after that one', () => {
    show()
    const dataTransfer = { effectAllowed: '', dropEffect: '', setData: vi.fn() }
    fireEvent.dragStart(tile(/^Personal/), { dataTransfer })
    const target = box(/^Family/)
    target.getBoundingClientRect = () => ({ top: 100, height: 44 }) as DOMRect
    fireEvent.dragOver(target, { dataTransfer, clientY: 140 })
    expect(within(target).getByTestId('drop-hint').className).toContain('-bottom-[6px]')
    fireEvent.drop(target, { dataTransfer })
    expect(invoke).toHaveBeenCalledWith('account:reorder', { ids: ['b', 'c', 'a', 'd'] })
    expect(screen.queryByTestId('drop-hint')).toBeNull()
  })

  test('dropping a tile where it already is sends nothing', () => {
    show()
    const dataTransfer = { effectAllowed: '', dropEffect: '', setData: vi.fn() }
    fireEvent.dragStart(tile(/^Pharmacy/), { dataTransfer })
    const target = box(/^Personal/)
    target.getBoundingClientRect = () => ({ top: 100, height: 44 }) as DOMRect
    fireEvent.dragOver(target, { dataTransfer, clientY: 140 })
    fireEvent.drop(target, { dataTransfer })
    expect(invoke).not.toHaveBeenCalled()
  })

  test('Alt+Down / Alt+Up move the focused tile, and focus follows it', async () => {
    const user = userEvent.setup()
    show()
    tile(/^Personal/).focus()
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}')
    expect(invoke).toHaveBeenLastCalledWith('account:reorder', { ids: ['b', 'a', 'c', 'd'] })
    act(() => {
      const s = snapshot()
      useUi
        .getState()
        .setSnap({ ...s, accounts: [s.accounts[1], s.accounts[0], s.accounts[2], s.accounts[3]] })
    })
    expect(document.activeElement).toBe(tile(/^Personal/))
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}')
    expect(invoke).toHaveBeenLastCalledWith('account:reorder', { ids: ['a', 'b', 'c', 'd'] })
  })

  test('Alt+Up on the first tile does nothing; plain arrows do nothing', async () => {
    const user = userEvent.setup()
    show()
    tile(/^Personal/).focus()
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}')
    await user.keyboard('{ArrowDown}')
    expect(invoke).not.toHaveBeenCalled()
  })
})

// The account menu (Task 28) is stood in for by a one-item menu; the real one opens dialogs the
// same way: openDialog() closes the menu, so the item that had focus unmounts.
function FakeMenu() {
  const menu = useUi((s) => s.menu)
  const openDialog = useUi((s) => s.openDialog)
  if (!menu) return null
  return (
    <div role="menu">
      <button
        type="button"
        role="menuitem"
        onClick={() =>
          openDialog({
            kind: 'confirm',
            accountId: menu.id,
            title: 'Remove?',
            body: '',
            confirmLabel: 'Remove',
            danger: true,
            onConfirm: () => {},
          })
        }
      >
        Remove…
      </button>
    </div>
  )
}

function DialogHost() {
  const dialog = useUi((s) => s.dialog)
  const trigger = useUi((s) => s.menuTrigger)
  if (!dialog) return null
  return (
    <Dialog title="Remove?" footer={null} returnFocus={() => accountTile(trigger)}>
      sure?
    </Dialog>
  )
}

describe('focus after a dialog opened from the account menu', () => {
  const openFromMenu = async (name: RegExp) => {
    const user = userEvent.setup()
    act(() => useUi.getState().setSnap(snapshot()))
    render(
      <>
        <Rail />
        <main>stage</main>
        <FakeMenu />
        <DialogHost />
      </>,
    )
    tile(name).focus()
    fireEvent.contextMenu(tile(name), { clientX: 30, clientY: 200 })
    await user.click(screen.getByRole('menuitem', { name: 'Remove…' }))
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.getByRole('dialog')).toBeTruthy()
    return user
  }

  test('tile → menu → dialog → Esc focuses that tile again', async () => {
    const user = await openFromMenu(/^Family/)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(tile(/^Family/))
  })

  test('the account is removed while its dialog is open: the active tile gets focus', async () => {
    await openFromMenu(/^Family/)
    act(() => {
      const s = snapshot()
      useUi.getState().setSnap({ ...s, accounts: s.accounts.filter((a) => a.id !== 'c') })
    })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(tile(/^Pharmacy/))
  })

  test('the last account is removed: the main region gets focus, not <body>', async () => {
    await openFromMenu(/^Pharmacy/)
    act(() => useUi.getState().setSnap(snapshot({ accounts: [], runtime: {}, activeId: null })))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('main'))
  })
})
