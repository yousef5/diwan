import type { ViewState } from '../shared/types'
import type { Logger } from './log'

export interface OnlineDeps {
  getState(id: string): ViewState
  setState(id: string, state: ViewState): void
  reloadGuest(id: string): boolean // false when the guest is gone
  hasGuest(id: string): boolean
  log: Logger
  debounceMs?: number
  reloadWindowMs?: number
}

// Debounces the guest's online/offline reports and reloads an offline/failed account when it
// comes back, at most once per window. A reload refused by the window is retried once, when
// the window ends, so a flap can never leave the account offline forever.
export function createOnlineSync(d: OnlineDeps) {
  const debounceMs = d.debounceMs ?? 1000
  const windowMs = d.reloadWindowMs ?? 10_000
  const debounce = new Map<string, NodeJS.Timeout>()
  const retry = new Map<string, NodeJS.Timeout>()
  const lastReload = new Map<string, number>()

  const needsReload = (id: string) => {
    const s = d.getState(id)
    return s === 'offline' || s === 'failed'
  }

  function tryReload(id: string): void {
    if (!d.hasGuest(id)) return
    const wait = (lastReload.get(id) ?? Number.NEGATIVE_INFINITY) + windowMs - Date.now()
    if (wait > 0) {
      if (retry.has(id)) return // never stack timers
      retry.set(
        id,
        setTimeout(() => {
          retry.delete(id)
          guarded(() => {
            if (needsReload(id) && d.hasGuest(id)) tryReload(id)
          })
        }, wait),
      )
      return
    }
    lastReload.set(id, Date.now())
    d.setState(id, 'loading')
    d.reloadGuest(id)
  }

  function guarded(fn: () => void): void {
    try {
      fn()
    } catch (e) {
      d.log.error('guest:online failed', e)
    }
  }

  function apply(id: string, online: boolean): void {
    guarded(() => {
      if (!online) {
        if (d.getState(id) !== 'loggingOut') d.setState(id, 'offline')
      } else if (needsReload(id)) tryReload(id)
    })
  }

  return {
    report(id: string, online: boolean): void {
      const t = debounce.get(id)
      if (t) clearTimeout(t)
      debounce.set(
        id,
        setTimeout(() => {
          debounce.delete(id)
          apply(id, online)
        }, debounceMs),
      )
    },
  }
}
