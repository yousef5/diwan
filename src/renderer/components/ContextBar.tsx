import type { MouseEvent } from 'react'
import type { Account, AccountRuntime, ViewState } from '../../shared/types'
import { unreadTotal } from '../../shared/unread'
import { call } from '../api'
import { Icon, type IconName } from '../icons'
import { hasCaptionButtons } from '../platform'
import { useUi } from '../state'

export const STATUS: Record<ViewState, { label: string; dot: string }> = {
  loading: { label: 'Connecting…', dot: 'bg-fg-mute' },
  ready: { label: 'Connected', dot: 'bg-ok' },
  offline: { label: 'Offline', dot: 'bg-warn' },
  failed: { label: 'Didn’t load', dot: 'bg-danger' },
  loggingOut: { label: 'Logging out…', dot: 'bg-fg-mute' },
  hung: { label: 'Not responding', dot: 'bg-warn' },
}

// The account menu is 228 px wide; "more" opens it right-aligned under the button.
const MENU_WIDTH = 228

// Electron zoom levels are powers of 1.2.
export const zoomPercent = (level: number) => Math.round(100 * 1.2 ** level)

// The next account after `activeId` (in rail order, wrapping) that has unread messages and is not
// muted: muted accounts don't count toward the Inbox total, the tray or the window title either.
export function nextUnread(
  accounts: Account[],
  runtime: Record<string, AccountRuntime>,
  activeId: string | null,
): string | null {
  const start = accounts.findIndex((a) => a.id === activeId)
  for (let i = 1; i <= accounts.length; i++) {
    const a = accounts[(start + i) % accounts.length]
    if (a.id !== activeId && !a.muted && (runtime[a.id]?.unread ?? 0) > 0) return a.id
  }
  return null
}

function BarButton({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: IconName
  label: string
  hint?: string
  onClick(e: MouseEvent<HTMLButtonElement>): void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={hint ?? label}
      onClick={onClick}
      className="no-drag flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-fg-dim hover:bg-bg-3 hover:text-fg"
    >
      <Icon name={icon} size={17} />
    </button>
  )
}

// The 48 px bar above WhatsApp (design B): who you're looking at and its connection state on the
// left; Inbox (unread across accounts), zoom, mute, reload and more on the right. The bar drags the
// frameless window; its controls don't. On Windows the native caption buttons sit over its right
// end, so the controls keep clear of them.
export function ContextBar() {
  const snap = useUi((s) => s.snap)
  const openMenu = useUi((s) => s.openMenu)
  const account = snap?.accounts.find((a) => a.id === snap.activeId)
  if (!snap || !account) return null
  const id = account.id
  const status = STATUS[snap.runtime[id]?.state ?? 'loading']
  const zoom = zoomPercent(account.zoom)
  const total = unreadTotal(snap.accounts, snap.runtime)
  const next = nextUnread(snap.accounts, snap.runtime, id)
  const right = hasCaptionButtons(snap) ? 'pr-[calc(0.75rem+var(--caption-w))]' : 'pr-3'

  const openMore = (e: MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    openMenu({ id, x: Math.max(8, r.right - MENU_WIDTH), y: r.bottom + 6 })
  }

  return (
    <header
      className={`drag flex h-12 shrink-0 items-center gap-3 border-b border-line bg-bg-1 ${right} pl-[18px]`}
    >
      <span
        aria-hidden="true"
        style={{ background: account.color }}
        className="h-2.5 w-2.5 shrink-0 rounded-full"
      />
      <h1 dir="auto" className="bidi-plain m-0 min-w-0 truncate text-[14px] font-semibold text-fg-strong">
        {account.name}
      </h1>
      <span data-testid="connection" className="flex shrink-0 items-center gap-1.5 text-[12px] text-fg-dim">
        <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
        {status.label}
      </span>
      {account.muted && (
        <span className="flex shrink-0 items-center gap-1 text-[12px] text-fg-dim">
          <Icon name="bellOff" size={13} /> Muted
        </span>
      )}
      <div className="flex-1" />

      {/* aria-disabled, not disabled: the button stays focusable, so its count can still be read. */}
      <button
        type="button"
        aria-label={total > 0 ? `Inbox, ${total} unread` : 'Inbox, no unread messages'}
        aria-disabled={next ? undefined : 'true'}
        title={next ? 'Go to the next account with unread messages' : 'No other account has unread messages'}
        onClick={() => {
          if (next) void call('account:activate', { id: next })
        }}
        className="no-drag flex h-[30px] shrink-0 items-center gap-[7px] rounded-lg border border-line-strong bg-bg-3 px-2.5 text-[12px] font-medium text-fg aria-disabled:cursor-default aria-disabled:text-fg-dim not-aria-disabled:hover:bg-bg-4"
      >
        <Icon name="inbox" size={15} />
        Inbox
        {total > 0 && (
          <span
            data-testid="inbox-count"
            aria-hidden="true"
            className="h-[18px] min-w-[18px] rounded-full bg-accent-strong px-[5px] text-center text-[11px] leading-[18px] font-semibold text-white"
          >
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      {account.zoom === 0 ? (
        <span className="shrink-0 px-1.5 font-mono text-[11px] text-fg-dim">
          <span className="sr-only">Zoom </span>100%
        </span>
      ) : (
        <button
          type="button"
          aria-label={`Zoom ${zoom}%, reset to 100%`}
          title="Reset zoom (Ctrl 0)"
          onClick={() => void call('account:zoom', { id, delta: 0 })}
          className="no-drag shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[11px] text-fg-dim hover:bg-bg-3 hover:text-fg"
        >
          {zoom}%
        </button>
      )}
      {/* The bell shows the current state: on (bell) or muted (bell crossed out). */}
      <BarButton
        icon={account.muted ? 'bellOff' : 'bell'}
        label={`${account.muted ? 'Unmute' : 'Mute'} notifications for ${account.name}`}
        onClick={() => void call('account:update', { id, patch: { muted: !account.muted } })}
      />
      <BarButton
        icon="refresh"
        label={`Reload ${account.name}`}
        hint="Reload (Ctrl R)"
        onClick={() => void call('account:reload', { id })}
      />
      <BarButton icon="more" label="More actions" onClick={openMore} />
    </header>
  )
}
