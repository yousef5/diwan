import type { AccountRuntime, ShellCommand } from '../shared/types'
import type { Logger } from './log'

export interface LogoutDeps {
  hasAccount(id: string): boolean
  runtimeOf(id: string): AccountRuntime
  setRuntime(id: string, patch: Partial<AccountRuntime>): void
  clearCustomAvatar(id: string): void
  hasGuest(id: string): boolean
  clearSession(id: string): Promise<void>
  removeAvatar(id: string): void
  forgetNotifications(id: string): void
  forgetAvatar(id: string): void
  sendShell(cmd: ShellCommand): void
  log: Logger
  detachTimeoutMs?: number
  pollMs?: number
}

// Sign an account out: unmount its webview, wipe the partition, start clean. Whatever goes
// wrong, the account must never stay in 'loggingOut' (the shell would render nothing forever).
export async function logoutAccount(id: string, d: LogoutDeps): Promise<void> {
  if (!d.hasAccount(id)) return
  if (d.runtimeOf(id).state === 'loggingOut') return
  d.setRuntime(id, { state: 'loggingOut' })
  let ok = false
  try {
    const deadline = Date.now() + (d.detachTimeoutMs ?? 5000)
    while (d.hasGuest(id) && Date.now() < deadline) await new Promise((r) => setTimeout(r, d.pollMs ?? 50))
    if (d.hasGuest(id)) d.log.warn('logout: guest did not detach in time', { id })
    await d.clearSession(id)
    d.removeAvatar(id)
    d.forgetNotifications(id)
    d.forgetAvatar(id)
    if (d.hasAccount(id)) d.clearCustomAvatar(id)
    ok = true
  } finally {
    if (d.hasAccount(id)) {
      d.setRuntime(id, ok ? { avatar: null, unread: 0, state: 'loading' } : { state: 'loading' })
      d.sendShell({ type: 'remount', id })
    }
  }
}
