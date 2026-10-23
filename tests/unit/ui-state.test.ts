import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { MAX_TOASTS, TOAST_MS, useUi } from '../../src/renderer/state'
import type { Account, Snapshot } from '../../src/shared/types'

const initial = useUi.getState()
const ui = () => useUi.getState()

const account = (id: string): Account => ({
  id,
  name: id,
  color: '#3b82f6',
  order: 0,
  zoom: 1,
  muted: false,
  customAvatar: false,
  createdAt: '2026-10-22T00:00:00.000Z',
})

const snap = (ids: string[]): Snapshot => ({
  accounts: ids.map(account),
  settings: {
    closeToTray: true,
    startHidden: false,
    showWindowControls: false,
    notifications: { enabled: true, sound: true, showPreview: true, markUrgent: true },
    window: { bounds: null, maximized: false },
  },
  runtime: {},
  activeId: ids[0] ?? null,
  recovery: false,
  importAvailable: false,
  trayAvailable: true,
})

beforeEach(() => {
  vi.useFakeTimers()
  useUi.setState(initial, true)
})
afterEach(() => {
  vi.useRealTimers()
})

describe('ui state', () => {
  test('starts empty', () => {
    expect(ui().snap).toBeNull()
    expect(ui().settingsOpen).toBe(false)
    expect(ui().section).toBe('general')
    expect(ui().dialog).toBeNull()
    expect(ui().menu).toBeNull()
    expect(ui().toasts).toEqual([])
  })

  test('setSnap stores the snapshot', () => {
    const s = snap(['a'])
    ui().setSnap(s)
    expect(ui().snap).toBe(s)
  })

  test('setSnap drops a menu or edit dialog whose account is gone', () => {
    ui().setSnap(snap(['a', 'b']))
    ui().openMenu({ id: 'b', x: 1, y: 2 })
    ui().setSnap(snap(['a']))
    expect(ui().menu).toBeNull()

    ui().openDialog({ kind: 'edit', id: 'a' })
    ui().setSnap(snap(['a']))
    expect(ui().dialog).toEqual({ kind: 'edit', id: 'a' })
    ui().setSnap(snap([]))
    expect(ui().dialog).toBeNull()
  })

  test('setSnap drops a confirm dialog whose account is gone; one without an account stays', () => {
    const confirm = {
      kind: 'confirm' as const,
      title: 'Remove b?',
      body: '',
      confirmLabel: 'Remove',
      danger: true,
      onConfirm: () => {},
    }
    ui().setSnap(snap(['a', 'b']))
    ui().openDialog({ ...confirm, accountId: 'b' })
    ui().setSnap(snap(['a', 'b']))
    expect(ui().dialog).toMatchObject({ kind: 'confirm', accountId: 'b' })
    ui().setSnap(snap(['a']))
    expect(ui().dialog).toBeNull()

    ui().openDialog(confirm)
    ui().setSnap(snap([]))
    expect(ui().dialog).toMatchObject({ kind: 'confirm', title: 'Remove b?' })
  })

  test('menuTrigger remembers the menu account past the menu, until that account is gone', () => {
    expect(ui().menuTrigger).toBeNull()
    ui().setSnap(snap(['a', 'b']))
    ui().openMenu({ id: 'b', x: 0, y: 0 })
    ui().openDialog({ kind: 'edit', id: 'b' }) // closes the menu
    expect(ui().menu).toBeNull()
    expect(ui().menuTrigger).toBe('b')
    ui().openMenu(null)
    expect(ui().menuTrigger).toBe('b')
    ui().openMenu({ id: 'a', x: 0, y: 0 })
    expect(ui().menuTrigger).toBe('a')
    ui().setSnap(snap(['b']))
    expect(ui().menuTrigger).toBeNull()
  })

  test('setSnap keeps other dialogs', () => {
    ui().openDialog({ kind: 'import' })
    ui().setSnap(snap([]))
    expect(ui().dialog).toEqual({ kind: 'import' })
  })

  test('bumpRemount counts per account', () => {
    ui().bumpRemount('a')
    ui().bumpRemount('a')
    ui().bumpRemount('b')
    expect(ui().remount).toEqual({ a: 2, b: 1 })
  })

  test('openSettings keeps the last section unless given one, and closes the menu', () => {
    ui().openMenu({ id: 'a', x: 0, y: 0 })
    ui().openSettings('data')
    expect(ui().settingsOpen).toBe(true)
    expect(ui().section).toBe('data')
    expect(ui().menu).toBeNull()
    ui().closeSettings()
    expect(ui().settingsOpen).toBe(false)
    ui().openSettings()
    expect(ui().section).toBe('data')
  })

  test('openDialog closes the menu; null closes the dialog', () => {
    ui().openMenu({ id: 'a', x: 0, y: 0 })
    ui().openDialog({ kind: 'add' })
    expect(ui().menu).toBeNull()
    expect(ui().dialog).toEqual({ kind: 'add' })
    ui().openDialog(null)
    expect(ui().dialog).toBeNull()
  })

  test('a toast disappears on its own after TOAST_MS', () => {
    ui().toast('Saved')
    expect(ui().toasts.map((t) => t.text)).toEqual(['Saved'])
    vi.advanceTimersByTime(TOAST_MS - 1)
    expect(ui().toasts).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(ui().toasts).toEqual([])
  })

  test('dismissToast removes one toast and leaves the rest', () => {
    ui().toast('one')
    ui().toast('two')
    ui().dismissToast(ui().toasts[0].id)
    expect(ui().toasts.map((t) => t.text)).toEqual(['two'])
  })

  test('the same text twice shows once, with a fresh timer', () => {
    ui().toast('Offline')
    vi.advanceTimersByTime(TOAST_MS - 100)
    ui().toast('Offline')
    expect(ui().toasts).toHaveLength(1)
    vi.advanceTimersByTime(200)
    expect(ui().toasts).toHaveLength(1)
    vi.advanceTimersByTime(TOAST_MS)
    expect(ui().toasts).toEqual([])
  })

  test(`at most ${MAX_TOASTS} toasts; the oldest goes first`, () => {
    for (let i = 0; i < MAX_TOASTS + 2; i++) ui().toast(`t${i}`)
    expect(ui().toasts.map((t) => t.text)).toEqual(Array.from({ length: MAX_TOASTS }, (_, i) => `t${i + 2}`))
  })

  test('an error toast has no timer: it stays until dismissed', () => {
    ui().toast('Could not reach WhatsApp', { error: true })
    expect(ui().toasts).toMatchObject([{ text: 'Could not reach WhatsApp', error: true }])
    vi.advanceTimersByTime(TOAST_MS * 100)
    expect(ui().toasts).toHaveLength(1)
    ui().dismissToast(ui().toasts[0].id)
    expect(ui().toasts).toEqual([])
  })

  test('the same text as an error replaces a plain toast and stays', () => {
    ui().toast('Offline')
    ui().toast('Offline', { error: true })
    vi.advanceTimersByTime(TOAST_MS * 2)
    expect(ui().toasts).toMatchObject([{ text: 'Offline', error: true }])
  })

  test('setToastsPaused stops every timer and resumes with what was left', () => {
    ui().toast('one')
    vi.advanceTimersByTime(1000)
    ui().toast('two')
    vi.advanceTimersByTime(1000)
    ui().setToastsPaused(true)
    ui().setToastsPaused(true) // idempotent
    vi.advanceTimersByTime(TOAST_MS * 10)
    expect(ui().toasts.map((t) => t.text)).toEqual(['one', 'two'])
    ui().setToastsPaused(false)
    vi.advanceTimersByTime(TOAST_MS - 2000)
    expect(ui().toasts.map((t) => t.text)).toEqual(['two'])
    vi.advanceTimersByTime(1000)
    expect(ui().toasts).toEqual([])
  })

  test('over the cap the oldest plain toast goes first; errors only when all are errors', () => {
    ui().toast('e1', { error: true })
    ui().toast('p1')
    ui().toast('e2', { error: true })
    ui().toast('p2')
    expect(ui().toasts.map((t) => t.text)).toEqual(['e1', 'e2', 'p2'])
    ui().toast('e3', { error: true })
    expect(ui().toasts.map((t) => t.text)).toEqual(['e1', 'e2', 'e3'])
    ui().toast('e4', { error: true })
    expect(ui().toasts.map((t) => t.text)).toEqual(['e2', 'e3', 'e4'])
  })

  test('toast ids are unique', () => {
    ui().toast('a')
    ui().toast('b')
    const [a, b] = ui().toasts
    expect(a.id).not.toBe(b.id)
  })
})
