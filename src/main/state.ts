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
// load state, avatar) and the active account live here.
//
// Push contract ('changed', sent to the shell as STATE_CHANGED):
// - Account, settings and active-account changes, and notify(), push at the end of the current
//   tick: several changes in one tick still make one push, but it never waits for the gap. A
//   trailing runtime push that is waiting is folded into it, so nothing goes out of order.
//   The microtask runs before ipcMain.handle sends its reply, so an awaited `account:add`
//   never resolves in the renderer before a snapshot that contains the account.
// - Runtime churn (setRuntime: unread, load state, avatar) is throttled to one push per
//   SNAPSHOT_GAP_MS; a burst is coalesced into a trailing push of the latest state.
// - flush() sends a waiting push right now. Call it before any message to the shell that
//   depends on the state (sendShell does), so a remount never overtakes the snapshot.
//   It is a no-op while a push is being delivered: a listener that changes state and flushes
//   (directly or through sendShell) would otherwise hand the later listeners the newer snapshot
//   before the one still being delivered. Its change goes out in the next push instead.
// The gap is measured on the monotonic clock: a wall-clock step (NTP, a manual change) must not
// freeze pushes. Persistence (Store, persistNow) is never throttled.
export const SNAPSHOT_GAP_MS = 50

export class StateHub extends EventEmitter<{ changed: [Snapshot] }> {
  // Not persisted. Callers must notify() after changing either of these.
  importAvailable = false
  trayAvailable = true
  private runtime = new Map<string, AccountRuntime>()
  private activeId: string | null
  // A push is queued: as a microtask, or as the timer below.
  private pending = false
  private timer: ReturnType<typeof setTimeout> | null = null
  private seq = 0 // only the newest queued push may fire; older microtasks are stale
  private lastEmit = Number.NEGATIVE_INFINITY // performance.now() of the last push
  private emitting = false // inside emit('changed'): flush() must not nest a push

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

  // Push at the end of this tick, regardless of the gap (see the contract above).
  notify(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    } else if (this.pending) return // a microtask push is already queued and will carry this
    this.pending = true
    this.atEndOfTick()
  }

  // Sends a queued push now, synchronously. No-op when nothing is waiting.
  flush(): void {
    if (this.pending && !this.emitting) this.emitNow()
  }

  // Runtime churn: after a quiet spell the push goes out at the end of this tick; inside the gap
  // it waits for the gap's end and then carries whatever the state is by then.
  private notifyRuntime(): void {
    if (this.pending) return
    this.pending = true
    // Clamped, so the wait can never exceed one gap whatever the clock does.
    const wait = Math.min(this.gapMs, this.lastEmit + this.gapMs - performance.now())
    if (wait <= 0) this.atEndOfTick()
    else {
      const n = ++this.seq
      this.timer = setTimeout(() => this.fire(n), wait)
      this.timer.unref?.()
    }
  }

  private atEndOfTick(): void {
    const n = ++this.seq
    queueMicrotask(() => this.fire(n))
  }

  private fire(n: number): void {
    if (n === this.seq && this.pending) this.emitNow()
  }

  private emitNow(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.pending = false
    this.lastEmit = performance.now()
    this.emitting = true
    try {
      this.emit('changed', this.snapshot())
    } catch (e) {
      try {
        this.onListenerError(e)
      } catch {}
    } finally {
      this.emitting = false
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
    this.notifyRuntime()
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
