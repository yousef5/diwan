import { create } from 'zustand'
import type { Snapshot } from '../shared/types'

// Renderer-only UI state. Everything durable lives in main and arrives as `snap`; the rest
// (which page, dialog, menu or toast is showing) is local to this window.

export type SettingsSection = 'general' | 'notifications' | 'accounts' | 'data' | 'shortcuts' | 'about'

export type DialogState =
  | null
  | { kind: 'add' }
  | { kind: 'edit'; id: string }
  | { kind: 'import' }
  | {
      kind: 'confirm'
      // The account this confirmation acts on (log out, remove): the dialog closes if it goes away.
      accountId?: string
      title: string
      body: string
      confirmLabel: string
      danger: boolean
      onConfirm: () => void
    }

export interface MenuState {
  id: string
  x: number
  y: number
}

export interface Toast {
  id: number
  text: string
  // Errors stay until dismissed; the rest leave after TOAST_MS.
  error: boolean
}

export const TOAST_MS = 4500
export const MAX_TOASTS = 3
// A paused toast that resumes with almost no time left still stays this long, so it doesn't vanish
// the moment the pointer leaves.
export const TOAST_RESUME_MIN_MS = 1000

interface UiState {
  snap: Snapshot | null
  // Bumped to force a fresh <webview> for an account (its key includes this count).
  remount: Record<string, number>
  settingsOpen: boolean
  section: SettingsSection
  dialog: DialogState
  menu: MenuState | null
  // The account whose menu was opened last. It outlives the menu (opening a dialog closes the
  // menu), so a dialog started from the menu can hand focus back to that account's rail tile.
  menuTrigger: string | null
  toasts: Toast[]
  // Hover or focus on the toast stack: auto-dismiss timers stop and keep their remaining time.
  toastsPaused: boolean
  setSnap(s: Snapshot): void
  bumpRemount(id: string): void
  openSettings(section?: SettingsSection): void
  closeSettings(): void
  openDialog(d: DialogState): void
  openMenu(m: MenuState | null): void
  toast(text: string, opts?: { error?: boolean }): void
  dismissToast(id: number): void
  setToastsPaused(paused: boolean): void
}

let toastSeq = 0
// Auto-dismiss clocks, one per non-error toast. `timer` is null while paused; `remaining` is what
// is left of TOAST_MS. Interval math on the monotonic clock.
interface ToastClock {
  timer: ReturnType<typeof setTimeout> | null
  remaining: number
  startedAt: number
}
const toastClocks = new Map<number, ToastClock>()

export const useUi = create<UiState>((set, get) => {
  const dismissToast = (id: number) => {
    const clock = toastClocks.get(id)
    if (clock?.timer) clearTimeout(clock.timer)
    toastClocks.delete(id)
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  }
  const run = (id: number, clock: ToastClock) => {
    clock.startedAt = performance.now()
    clock.timer = setTimeout(() => dismissToast(id), clock.remaining)
  }

  return {
    snap: null,
    remount: {},
    settingsOpen: false,
    section: 'general',
    dialog: null,
    menu: null,
    menuTrigger: null,
    toasts: [],
    toastsPaused: false,

    // A menu, edit dialog or account confirmation for an account that no longer exists would act
    // on nothing.
    setSnap: (snap) =>
      set((s) => {
        const exists = (id: string) => snap.accounts.some((a) => a.id === id)
        const d = s.dialog
        const orphan =
          (d?.kind === 'edit' && !exists(d.id)) ||
          (d?.kind === 'confirm' && d.accountId !== undefined && !exists(d.accountId))
        return {
          snap,
          menu: s.menu && !exists(s.menu.id) ? null : s.menu,
          menuTrigger: s.menuTrigger && !exists(s.menuTrigger) ? null : s.menuTrigger,
          dialog: orphan ? null : d,
        }
      }),
    bumpRemount: (id) => set((s) => ({ remount: { ...s.remount, [id]: (s.remount[id] ?? 0) + 1 } })),
    openSettings: (section) =>
      set((s) => ({ settingsOpen: true, section: section ?? s.section, menu: null })),
    closeSettings: () => set({ settingsOpen: false }),
    openDialog: (dialog) => set({ dialog, menu: null }),
    openMenu: (menu) => set((s) => ({ menu, menuTrigger: menu ? menu.id : s.menuTrigger })),

    // A repeated message (say, the same failure twice) shows once, with a fresh timer. Only the
    // newest MAX_TOASTS stay, so a burst of failures can't cover the window (that cap applies to
    // errors too: the oldest goes first).
    toast: (text, opts) => {
      const error = opts?.error === true
      for (const t of get().toasts) if (t.text === text) dismissToast(t.id)
      const over = get().toasts.length + 1 - MAX_TOASTS
      for (const t of get().toasts.slice(0, Math.max(0, over))) dismissToast(t.id)
      const id = ++toastSeq
      if (!error) {
        const clock: ToastClock = { timer: null, remaining: TOAST_MS, startedAt: 0 }
        toastClocks.set(id, clock)
        if (!get().toastsPaused) run(id, clock)
      }
      set((s) => ({ toasts: [...s.toasts, { id, text, error }] }))
    },
    dismissToast,
    setToastsPaused: (paused) => {
      if (paused === get().toastsPaused) return
      const live = new Set(get().toasts.map((t) => t.id))
      for (const [id, clock] of toastClocks) {
        if (!live.has(id)) {
          if (clock.timer) clearTimeout(clock.timer)
          toastClocks.delete(id)
        } else if (paused && clock.timer) {
          clearTimeout(clock.timer)
          clock.timer = null
          clock.remaining = Math.max(0, clock.remaining - (performance.now() - clock.startedAt))
        } else if (!paused && !clock.timer) {
          clock.remaining = Math.max(clock.remaining, TOAST_RESUME_MIN_MS)
          run(id, clock)
        }
      }
      set({ toastsPaused: paused })
    },
  }
})
