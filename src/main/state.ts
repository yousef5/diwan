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

const DEFAULT_RUNTIME: AccountRuntime = { state: 'loading', unread: 0, avatar: null }

// Owns everything the shell renders. Persistent data lives in the Store; runtime (unread,
// load state, avatar) and the active account live here. Emits one 'changed' per tick.
export class StateHub extends EventEmitter<{ changed: [Snapshot] }> {
  importAvailable = false
  trayAvailable = true
  private runtime = new Map<string, AccountRuntime>()
  private activeId: string | null
  private pending = false

  constructor(readonly store: Store) {
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
    queueMicrotask(() => {
      this.pending = false
      this.emit('changed', this.snapshot())
    })
  }

  addAccount(name: string, color: string, id: string = randomUUID()): Account {
    const account: Account = {
      id,
      name: name.trim(),
      color,
      order: this.accounts().length,
      zoom: 0,
      muted: false,
      customAvatar: false,
      createdAt: new Date().toISOString(),
    }
    this.store.update((f) => {
      f.accounts.push(account)
    })
    if (!this.activeId) this.activeId = id
    this.persistNow()
    this.notify()
    return account
  }

  updateAccount(
    id: string,
    patch: Partial<Pick<Account, 'name' | 'color' | 'muted' | 'zoom' | 'customAvatar'>>,
  ): void {
    this.mutate((f) => {
      const a = f.accounts.find((x) => x.id === id)
      if (a) Object.assign(a, patch)
    })
  }

  removeAccount(id: string): void {
    this.mutate((f) => {
      f.accounts = f.accounts.filter((a) => a.id !== id).map((a, i) => ({ ...a, order: i }))
    })
    this.runtime.delete(id)
    if (this.activeId === id) this.activeId = this.accounts()[0]?.id ?? null
    this.notify()
    this.persistNow()
  }

  reorder(ids: string[]): void {
    const pos = new Map(ids.map((id, i) => [id, i]))
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
    this.mutate((f) => {
      f.importedFromNexus = true
    })
    this.importAvailable = false
    this.notify()
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

  private mutate(fn: (f: DiwanFile) => void): void {
    if (this.store.recovery) return
    this.store.update(fn)
    this.notify()
  }
}
