import { type DragEvent, type KeyboardEvent, type MouseEvent, memo } from 'react'
import type { Account, AccountRuntime } from '../../shared/types'
import { initials } from '../format'
import { Kbd } from '../ui/Kbd'
import { Tooltip } from './Tooltip'

// Load states that get the amber dot and are spoken in the tile's name.
const PROBLEM: Partial<Record<AccountRuntime['state'], string>> = {
  offline: 'offline',
  failed: 'failed to load',
  hung: 'not responding',
}

export function tileLabel(account: Account, runtime: AccountRuntime): string {
  const parts = [account.name]
  if (runtime.unread > 0) parts.push(`${runtime.unread} unread`)
  if (account.muted) parts.push('muted')
  const problem = PROBLEM[runtime.state]
  if (problem) parts.push(problem)
  return parts.join(', ')
}

// Handlers take the account id, so the rail passes the same functions to every tile and a tile
// only re-renders when something it shows changes (see `sameTile` below).
export interface TileProps {
  account: Account
  runtime: AccountRuntime
  index: number
  active: boolean
  dropHint: 'before' | 'after' | null
  onSelect(id: string): void
  onMenu(id: string, e: MouseEvent<HTMLButtonElement>): void
  onKeyDown(id: string, e: KeyboardEvent<HTMLButtonElement>): void
  onDragStart(id: string, e: DragEvent): void
  onDragEnd(): void
}

// One account in the rail (design B): a 44 px tile in the account colour with the picture or the
// initials. Active = a 3 px accent bar on the left edge and a 2 px bg / 2 px accent ring, which is
// why keyboard focus uses focus-ring-wide (outside that ring). Unread pill top-right (grey when
// muted), amber dot bottom-right when the page is offline, failed or hung. Drops are handled by
// the rail's list, so the gaps between tiles accept them too.
export const AccountTile = memo(Tile, sameTile)

// Only what the tile draws or says counts; order, zoom and the like don't.
export function sameTile(a: TileProps, b: TileProps): boolean {
  return (
    a.account.id === b.account.id &&
    a.account.name === b.account.name &&
    a.account.color === b.account.color &&
    a.account.muted === b.account.muted &&
    a.runtime.state === b.runtime.state &&
    a.runtime.unread === b.runtime.unread &&
    a.runtime.avatar === b.runtime.avatar &&
    a.active === b.active &&
    a.index === b.index &&
    a.dropHint === b.dropHint &&
    a.onSelect === b.onSelect &&
    a.onMenu === b.onMenu &&
    a.onKeyDown === b.onKeyDown &&
    a.onDragStart === b.onDragStart &&
    a.onDragEnd === b.onDragEnd
  )
}

function Tile({
  account,
  runtime,
  index,
  active,
  dropHint,
  onSelect,
  onMenu,
  onKeyDown,
  onDragStart,
  onDragEnd,
}: TileProps) {
  const id = account.id
  const problem = PROBLEM[runtime.state] !== undefined
  return (
    <div className="relative flex w-[68px] justify-center">
      {dropHint && (
        <div
          data-testid="drop-hint"
          className={`absolute right-3 left-3 h-0.5 rounded bg-accent ${dropHint === 'before' ? '-top-[6px]' : '-bottom-[6px]'}`}
        />
      )}
      {active && <div className="absolute top-2.5 left-0 h-6 w-[3px] rounded-r-[3px] bg-accent" />}
      <Tooltip label={account.name} hint={index < 9 ? <Kbd>{`Ctrl ${index + 1}`}</Kbd> : undefined}>
        {(describedBy) => (
          <button
            type="button"
            data-account-tile={id}
            data-active-tile={active ? '' : undefined}
            aria-label={tileLabel(account, runtime)}
            aria-describedby={describedBy}
            aria-current={active ? 'true' : undefined}
            aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
            draggable
            onClick={() => onSelect(id)}
            onContextMenu={(e) => onMenu(id, e)}
            onKeyDown={(e) => onKeyDown(id, e)}
            onDragStart={(e) => onDragStart(id, e)}
            onDragEnd={onDragEnd}
            style={{ background: account.color }}
            className={`no-drag focus-ring-wide flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl transition-[opacity,box-shadow] ${
              active
                ? 'opacity-100 shadow-[0_0_0_2px_var(--color-bg-1),0_0_0_4px_var(--color-accent)]'
                : 'opacity-[0.82] hover:opacity-100'
            }`}
          >
            {runtime.avatar ? (
              <img src={runtime.avatar} alt="" className="h-full w-full object-cover" draggable={false} />
            ) : (
              <span dir="auto" className="bidi-plain text-[14px] font-semibold text-white">
                {initials(account.name)}
              </span>
            )}
          </button>
        )}
      </Tooltip>
      {runtime.unread > 0 && (
        <span
          data-testid="unread-pill"
          aria-hidden="true"
          className={`pointer-events-none absolute -top-1 left-[38px] h-[18px] min-w-[18px] rounded-full border-2 border-bg-1 px-[5px] text-center text-[11px] leading-[14px] font-semibold text-white ${
            account.muted ? 'bg-pill-muted' : 'bg-accent-strong'
          }`}
        >
          {runtime.unread > 99 ? '99+' : runtime.unread}
        </span>
      )}
      {problem && (
        <span
          data-testid="offline-dot"
          aria-hidden="true"
          className="pointer-events-none absolute top-[34px] left-11 h-2.5 w-2.5 rounded-full border-2 border-bg-1 bg-warn"
        />
      )}
    </div>
  )
}
