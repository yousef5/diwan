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
}

export const TOAST_MS = 4500
export const MAX_TOASTS = 3

interface UiState {
  snap: Snapshot | null
  // Bumped to force a fresh <webview> for an account (its key includes this count).
  remount: Record<string, number>
  settingsOpen: boolean
  section: SettingsSection
  dialog: DialogState
  menu: MenuState | null
  toasts: Toast[]
  setSnap(s: Snapshot): void
  bumpRemount(id: string): void
  openSettings(section?: SettingsSection): void
  closeSettings(): void
  openDialog(d: DialogState): void
  openMenu(m: MenuState | null): void
  toast(text: string): void
  dismissToast(id: number): void
}

let toastSeq = 0
const toastTimers = new Map<number, ReturnType<typeof setTimeout>>()

export const useUi = create<UiState>((set, get) => {
  const dismissToast = (id: number) => {
    clearTimeout(toastTimers.get(id))
    toastTimers.delete(id)
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  }

  return {
    snap: null,
    remount: {},
    settingsOpen: false,
    section: 'general',
    dialog: null,
    menu: null,
    toasts: [],

    // A menu or edit dialog for an account that no longer exists would act on nothing.
    setSnap: (snap) =>
      set((s) => {
        const exists = (id: string) => snap.accounts.some((a) => a.id === id)
        return {
          snap,
          menu: s.menu && !exists(s.menu.id) ? null : s.menu,
          dialog: s.dialog?.kind === 'edit' && !exists(s.dialog.id) ? null : s.dialog,
        }
      }),
    bumpRemount: (id) => set((s) => ({ remount: { ...s.remount, [id]: (s.remount[id] ?? 0) + 1 } })),
    openSettings: (section) =>
      set((s) => ({ settingsOpen: true, section: section ?? s.section, menu: null })),
    closeSettings: () => set({ settingsOpen: false }),
    openDialog: (dialog) => set({ dialog, menu: null }),
    openMenu: (menu) => set({ menu }),

    // A repeated message (say, the same failure twice) shows once, with a fresh timer. Only the
    // newest MAX_TOASTS stay, so a burst of failures can't cover the window.
    toast: (text) => {
      for (const t of get().toasts) if (t.text === text) dismissToast(t.id)
      const over = get().toasts.length + 1 - MAX_TOASTS
      for (const t of get().toasts.slice(0, Math.max(0, over))) dismissToast(t.id)
      const id = ++toastSeq
      toastTimers.set(
        id,
        setTimeout(() => dismissToast(id), TOAST_MS),
      )
      set((s) => ({ toasts: [...s.toasts, { id, text }] }))
    },
    dismissToast,
  }
})
