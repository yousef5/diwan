import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import type {
  Account,
  AccountRuntime,
  DiwanFile,
  Settings,
  SettingsPatch,
  Snapshot,
  WindowState,
} from '../shared/types'
import type { DeepReadonly, Store } from './store/store'

const DEFAULT_RUNTIME: AccountRuntime = Object.freeze({ state: 'loading', unread: 0, avatar: null })

// Owns everything the shell renders. Persistent data lives in the Store; runtime (unread,
// load state, avatar) and the active account live here. Emits one 'changed' per tick, and at
// most one per SNAPSHOT_GAP_MS: a burst is coalesced into a trailing emit of the latest state.
// Only the pushes are throttled; persistence (Store, persistNow) is untouched.
export const SNAPSHOT_GAP_MS = 50

export class StateHub extends EventEmitter<{ changed: [Snapshot] }> {
  // Not persisted. Callers must notify() after changing either of these.
  importAvailable = false
  trayAvailable = true
  private runtime = new Map<string, AccountRuntime>()
  private activeId: string | null
  private pending = false
  private lastEmit = Number.NEGATIVE_INFINITY

  constructor(
    readonly store: Store,
    private readonly onListenerError: (e: unknown) => void = (e) => console.error(e),
    private readonly gapMs: number = SNAPSHOT_GAP_MS,
  ) {
    super()
    this.activeId = this.accounts()[0]?.id ?? null
  }

  accounts(): readonly DeepReadonly<Account>[] {
    return this.store.get().accounts
  }

  account(id: string): DeepReadonly<Account> | undefined {
    return this.accounts().find((a) => a.id === id)
  }

  settings(): DeepReadonly<Settings> {
    return this.store.get().settings
  }

  active(): string | null {
    return this.activeId
  }

  runtimeOf(id: string): AccountRuntime {
    return this.runtime.get(id) ?? DEFAULT_RUNTIME
  }

  snapshot(): Snapshot {
    const accounts = this.accounts()
    // Frozen store data is handed out as-is (read-only by contract; fine for IPC cloning).
    return {
      accounts: accounts as Account[],
      settings: this.settings() as Settings,
      runtime: Object.fromEntries(accounts.map((a) => [a.id, this.runtimeOf(a.id)])),
      activeId: this.activeId,
      recovery: this.store.recovery,
      importAvailable: this.importAvailable,
      trayAvailable: this.trayAvailable,
    }
  }

  notify(): void {
    if (this.pending) return
    this.pending = true
    const wait = this.lastEmit + this.gapMs - Date.now()
    // After a quiet spell the push goes out at the end of this tick, as before; inside the gap it
    // waits for the gap's end and then carries whatever the state is by then.
    if (wait <= 0) queueMicrotask(() => this.emitNow())
    else setTimeout(() => this.emitNow(), wait).unref?.()
  }

  private emitNow(): void {
    this.pending = false
    this.lastEmit = Date.now()
    try {
      this.emit('changed', this.snapshot())
    } catch (e) {
      try {
        this.onListenerError(e)
      } catch {}
    }
  }

  addAccount(name: string, color: string, id: string = randomUUID(), importedFrom?: string): Account {
    const account: Account = {
      id,
      name: name.trim(),
      color,
      order: this.accounts().length,
      zoom: 0,
      muted: false,
      customAvatar: false,
      createdAt: new Date().toISOString(),
      ...(importedFrom ? { importedFrom } : {}),
    }
    this.store.update((f) => {
      f.accounts.push(account)
      // A re-added id (re-import) owns its folder again: it must never be swept.
      f.pendingFolderRemovals = f.pendingFolderRemovals.filter((p) => p !== id)
    })
    if (!this.activeId) this.activeId = id
    this.persistNow()
    this.notify()
    const stored = this.account(id)
    if (!stored) throw new Error('account was not stored')
    return stored as Account
  }

  updateAccount(
    id: string,
    patch: Partial<Pick<Account, 'name' | 'color' | 'muted' | 'zoom' | 'customAvatar'>>,
  ): void {
    const cur = this.account(id)
    if (!cur) return
    const changed = (Object.keys(patch) as (keyof typeof patch)[]).some(
      (k) => patch[k] !== undefined && patch[k] !== cur[k],
    )
    if (!changed) return
    if (
      this.mutate((f) => {
        const a = f.accounts.find((x) => x.id === id)
        if (a) Object.assign(a, patch)
      })
    )
      this.persistNow()
  }

  removeAccount(id: string): void {
    if (!this.account(id)) return
    if (
      !this.mutate((f) => {
        f.accounts = f.accounts.filter((a) => a.id !== id).map((a, i) => ({ ...a, order: i }))
        // Same update: Chromium may write the folder back before quitting, so it is deleted again
        // at the next start. Only tombstoned ids are ever swept, never mere absence from the list.
        if (!f.pendingFolderRemovals.includes(id)) f.pendingFolderRemovals.push(id)
      })
    )
      return
    this.runtime.delete(id)
    if (this.activeId === id) this.activeId = this.accounts()[0]?.id ?? null
    this.persistNow()
  }

  pendingFolderRemovals(): readonly string[] {
    return this.store.get().pendingFolderRemovals
  }

  clearFolderRemovals(ids: readonly string[]): void {
    const drop = new Set(ids)
    if (!this.pendingFolderRemovals().some((id) => drop.has(id))) return
    if (
      !this.mutate((f) => {
        f.pendingFolderRemovals = f.pendingFolderRemovals.filter((id) => !drop.has(id))
      })
    )
      return
    this.persistNow()
  }

  reorder(ids: string[]): void {
    const pos = new Map(ids.map((id, i) => [id, i]))
    const next = this.accounts()
      .map((a) => a)
      .sort((a, b) => (pos.get(a.id) ?? 1e9) - (pos.get(b.id) ?? 1e9) || a.order - b.order)
    if (next.every((a, i) => a.id === this.accounts()[i]?.id && a.order === i)) return
    this.mutate((f) => {
      f.accounts.sort((a, b) => (pos.get(a.id) ?? 1e9) - (pos.get(b.id) ?? 1e9) || a.order - b.order)
      f.accounts.forEach((a, i) => {
        a.order = i
      })
    })
  }

  setActive(id: string): boolean {
    if (!this.account(id) || this.activeId === id) return false
    this.activeId = id
    this.notify()
    return true
  }

  cycle(dir: 1 | -1): string | null {
    const list = this.accounts()
    if (list.length === 0) return null
    const i = list.findIndex((a) => a.id === this.activeId)
    const next = list[(i + dir + list.length) % list.length]
    this.setActive(next.id)
    return next.id
  }

  setRuntime(id: string, patch: Partial<AccountRuntime>): void {
    if (!this.account(id)) return
    const cur = this.runtimeOf(id)
    const next = { ...cur, ...patch }
    if (cur.state === next.state && cur.unread === next.unread && cur.avatar === next.avatar) return
    this.runtime.set(id, next)
    this.notify()
  }

  updateSettings(patch: SettingsPatch): void {
    this.mutate((f) => {
      const { notifications, ...rest } = patch
      Object.assign(f.settings, rest)
      if (notifications) Object.assign(f.settings.notifications, notifications)
    })
  }

  // Window geometry changes constantly; save it without pushing a snapshot to the shell.
  persistWindow(w: WindowState): void {
    if (this.store.recovery) return
    this.store.update((f) => {
      f.settings.window = w
    })
  }

  markImported(): void {
    if (
      !this.mutate((f) => {
        f.importedFromNexus = true
      })
    )
      return
    this.importAvailable = false
    this.persistNow()
  }

  // Account changes are written at once, not debounced. A failed write is already reported
  // (onError) and retried by the store with backoff, so it must not abort the state update.
  private persistNow(): void {
    if (this.store.recovery) return
    try {
      this.store.flush()
    } catch {}
  }

  private mutate(fn: (f: DiwanFile) => void): boolean {
    if (this.store.recovery) return false
    this.store.update(fn)
    this.notify()
    return true
  }
}
