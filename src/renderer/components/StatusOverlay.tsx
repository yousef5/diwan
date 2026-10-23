import { useEffect, useRef } from 'react'
import type { ViewState } from '../../shared/types'
import { call } from '../api'
import { mainRegion, stageMayTakeFocus } from '../focus'
import { Icon } from '../icons'
import { useUi } from '../state'
import { Button } from '../ui/Button'

type Copy = { icon: 'wifiOff' | 'alert' | 'loader'; title: string; body: string; actions: boolean }

// The states that cover the page. Loading and ready show WhatsApp itself.
export const OVERLAY: Partial<Record<ViewState, Copy>> = {
  offline: {
    icon: 'wifiOff',
    title: 'You’re offline',
    body: 'Diwan reconnects by itself when the network is back.',
    actions: true,
  },
  failed: {
    icon: 'alert',
    title: 'WhatsApp didn’t load',
    body: 'The page failed to load. Retry, or restart it if that doesn’t help.',
    actions: true,
  },
  hung: {
    icon: 'loader',
    title: 'WhatsApp stopped responding',
    body: 'Restarting it now. Your login is kept.',
    actions: false,
  },
  loggingOut: {
    icon: 'loader',
    title: 'Logging out…',
    body: 'Clearing this account’s WhatsApp data. A new QR code follows.',
    actions: false,
  },
}

// A card over the active account's page when it is offline, failed, hung or logging out. It is not
// a live region: Stage announces state changes through its own status region. The webview under it
// is inert, so if focus was in WhatsApp it moves here (Retry, or the main region when there are
// no buttons) instead of dropping to <body>.
export function StatusOverlay({ id, state }: { id: string; state: ViewState }) {
  const copy = OVERLAY[state]
  const bumpRemount = useUi((s) => s.bumpRemount)
  const retry = useRef<HTMLButtonElement>(null)

  // Stage keys this component by account, so a switch to another covered account runs this again.
  useEffect(() => {
    if (!OVERLAY[state]) return
    const s = useUi.getState()
    if (!stageMayTakeFocus(s.settingsOpen || s.dialog !== null || s.menu !== null)) return
    if (retry.current) retry.current.focus()
    else mainRegion()?.focus()
  }, [state])

  if (!copy) return null
  return (
    <div
      data-testid="status-overlay"
      className="absolute inset-0 z-20 flex items-center justify-center bg-bg-0/95"
    >
      <div className="flex w-[360px] max-w-[calc(100%-32px)] flex-col items-center gap-3 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-line-strong bg-bg-3 text-fg-dim">
          <Icon
            name={copy.icon}
            size={22}
            className={copy.icon === 'loader' ? 'motion-safe:animate-spin' : ''}
          />
        </span>
        <h2 className="mt-1 text-[16px] font-semibold text-fg-strong">{copy.title}</h2>
        <p className="m-0 text-[13px] leading-relaxed text-fg-dim">{copy.body}</p>
        {copy.actions && (
          <div className="mt-2 flex gap-2">
            <Button ref={retry} variant="primary" onClick={() => void call('account:reload', { id })}>
              <Icon name="refresh" size={15} /> Retry
            </Button>
            <Button variant="ghost" onClick={() => bumpRemount(id)}>
              Restart WhatsApp
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
