import {
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import type { AccountRuntime } from '../../shared/types'
import { call } from '../api'
import { accountTile, activeTile, focusFirst, mainRegion } from '../focus'
import { DiwanMark, Icon } from '../icons'
import { useUi } from '../state'
import { Kbd } from '../ui/Kbd'
import { AccountTile } from './AccountTile'
import { Tooltip } from './Tooltip'

const NO_RUNTIME: AccountRuntime = { state: 'loading', unread: 0, avatar: null }

// A private type: with text/plain, dropping a tile on WhatsApp's compose box would paste the id.
export const DRAG_TYPE = 'application/x-diwan-account'

// A contextmenu this soon after Shift+F10 or the menu key came from the keyboard. Chromium puts it
// at the tile's centre, which would cover the tile, so the menu opens beside it instead.
const KEY_MENU_MS = 500

type Drop = { id: string; where: 'before' | 'after' }

// `ids` with `id` moved to just before or after `target`.
export function moveId(ids: string[], id: string, target: string, where: 'before' | 'after'): string[] {
  const rest = ids.filter((x) => x !== id)
  const at = rest.indexOf(target)
  if (at < 0 || id === target) return ids
  rest.splice(at + (where === 'after' ? 1 : 0), 0, id)
  return rest
}

// Where a tile dragged from `from` lands for a pointer at `y`, given the tiles' vertical centres
// (top to bottom): before the first tile whose centre is below the pointer, else after the last.
// Null when that slot is where the tile already is.
export function dropTarget(ids: string[], centres: number[], from: number, y: number): Drop | null {
  const at = centres.filter((c) => c < y).length
  if (ids.length === 0 || at === from || at === from + 1) return null
  return at < ids.length ? { id: ids[at], where: 'before' } : { id: ids[ids.length - 1], where: 'after' }
}

// The 68 px account rail (design B): logo, divider, account tiles, dashed "add", settings at the
// bottom. Tiles reorder by drag (the whole list, gaps included, is the drop target), or by Alt+↑/↓
// on a focused tile, which a polite status line announces. Right-click or the context-menu key
// (Shift+F10) opens the account menu.
export function Rail() {
  const snap = useUi((s) => s.snap)
  const openDialog = useUi((s) => s.openDialog)
  const openMenu = useUi((s) => s.openMenu)
  const openSettings = useUi((s) => s.openSettings)
  const [dragId, setDragId] = useState<string | null>(null)
  const [drop, setDrop] = useState<Drop | null>(null)
  const [announcement, setAnnouncement] = useState('')
  // A tile moved by keyboard: React moves its DOM node, which drops focus, so put it back (and say
  // where it went) once the new order arrives.
  const refocus = useRef<string | null>(null)
  const keyMenuAt = useRef(Number.NEGATIVE_INFINITY)
  const order = snap?.accounts.map((a) => a.id).join('\n')

  useLayoutEffect(() => {
    const id = refocus.current
    if (!id || order === undefined) return
    refocus.current = null
    const accounts = useUi.getState().snap?.accounts ?? []
    const i = accounts.findIndex((a) => a.id === id)
    if (i < 0) return
    accountTile(id)?.focus()
    setAnnouncement(`${accounts[i].name} moved to position ${i + 1} of ${accounts.length}`)
  }, [order])

  // A removed account takes its tile, and the focus on it, with it (say, after Remove in its menu):
  // focus moves to the tile that took its place, else the one before, else the active tile, else
  // the main region; never <body>. Only when focus was actually lost, so nothing is stolen.
  const lastIds = useRef<string[]>([])
  useLayoutEffect(() => {
    const ids = order ? order.split('\n') : []
    const before = lastIds.current
    lastIds.current = ids
    const gone = before.findIndex((id) => !ids.includes(id))
    const el = document.activeElement
    const lost = !el || el === document.body || !el.isConnected
    if (gone < 0 || !lost) return
    focusFirst([() => accountTile(ids[gone]), () => accountTile(ids[gone - 1]), activeTile, mainRegion])
  }, [order])

  // Stable handlers, shared by every tile (AccountTile is memoised). They read the store directly
  // so they never need the render's snapshot.
  const onSelect = useCallback((id: string) => void call('account:activate', { id }), [])

  const onMenu = useCallback(
    (id: string, e: MouseEvent<HTMLButtonElement>) => {
      e.preventDefault()
      const fromKeys = performance.now() - keyMenuAt.current < KEY_MENU_MS
      keyMenuAt.current = Number.NEGATIVE_INFINITY
      if (fromKeys || (e.clientX === 0 && e.clientY === 0)) {
        const r = e.currentTarget.getBoundingClientRect()
        openMenu({ id, x: r.right + 8, y: r.top, flipY: r.bottom })
      } else {
        openMenu({ id, x: e.clientX, y: e.clientY })
      }
    },
    [openMenu],
  )

  const onKeyDown = useCallback((id: string, e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
      keyMenuAt.current = performance.now()
      return
    }
    const up = e.key === 'ArrowUp'
    if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || (!up && e.key !== 'ArrowDown')) return
    e.preventDefault()
    const accounts = useUi.getState().snap?.accounts ?? []
    const ids = accounts.map((a) => a.id)
    const i = ids.indexOf(id)
    if (i < 0) return
    const to = up ? i - 1 : i + 1
    if (to < 0 || to >= ids.length) {
      setAnnouncement(`${accounts[i].name} is already ${up ? 'first' : 'last'}`)
      return
    }
    refocus.current = id
    void call('account:reorder', { ids: moveId(ids, id, ids[to], up ? 'before' : 'after') }).finally(() => {
      // The new order (pushed before the reply) has been handled by now; after a failure nothing
      // will come, and a stale id must not steal focus on some later reorder.
      if (refocus.current === id) refocus.current = null
    })
  }, [])

  const onDragStart = useCallback((id: string, e: DragEvent) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData(DRAG_TYPE, id)
    setDragId(id)
  }, [])
  const endDrag = useCallback(() => {
    setDragId(null)
    setDrop(null)
  }, [])

  if (!snap) return null
  const { accounts, runtime, activeId } = snap
  const ids = accounts.map((a) => a.id)

  // Drag-over anywhere in the list, gaps and padding included, picks the nearest slot. Drags that
  // didn't start on a tile (files, text) are ignored, so they can't be dropped here.
  const onListDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!dragId) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const centres = Array.from(e.currentTarget.querySelectorAll('[data-account-tile]'), (el) => {
      const r = el.getBoundingClientRect()
      return r.top + r.height / 2
    })
    const next = dropTarget(ids, centres, ids.indexOf(dragId), e.clientY)
    if (next?.id !== drop?.id || next?.where !== drop?.where) setDrop(next)
  }
  const onListDrop = (e: DragEvent<HTMLDivElement>) => {
    if (!dragId) return
    e.preventDefault()
    if (drop) void call('account:reorder', { ids: moveId(ids, dragId, drop.id, drop.where) })
    endDrag()
  }
  // Leaving the list (not just moving between tiles inside it) hides the drop line.
  const onListDragLeave = (e: DragEvent<HTMLDivElement>) => {
    const list = e.currentTarget
    const to = e.relatedTarget
    if (to instanceof Node && list.contains(to)) return
    const r = list.getBoundingClientRect()
    const inside = e.clientX >= r.left && e.clientX < r.right && e.clientY >= r.top && e.clientY < r.bottom
    if (to || !inside) setDrop(null)
  }

  return (
    <nav
      aria-label="Accounts"
      className="drag flex w-[68px] shrink-0 flex-col items-center gap-2.5 border-r border-line bg-bg-1 pt-3.5 pb-3"
    >
      <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] border border-line-strong bg-bg-3 text-fg">
        <DiwanMark size={22} />
      </div>
      <div className="my-1 h-px w-7 shrink-0 bg-line-strong" />

      {/* The 8 px padding (cancelled by the negative margin, so spacing matches the design) keeps
          the unread pills and the wide focus ring of the first and last tile inside the scroll box. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: mouse drop target; Alt+Up/Down on a tile is the keyboard path */}
      <div
        data-testid="rail-list"
        onDragOver={onListDragOver}
        onDrop={onListDrop}
        onDragLeave={onListDragLeave}
        className="no-drag -my-2 flex min-h-0 flex-col items-center gap-2.5 overflow-y-auto py-2 [scrollbar-width:none]"
      >
        {accounts.map((a, i) => (
          <AccountTile
            key={a.id}
            account={a}
            runtime={runtime[a.id] ?? NO_RUNTIME}
            index={i}
            active={a.id === activeId}
            dropHint={drop?.id === a.id ? drop.where : null}
            onSelect={onSelect}
            onMenu={onMenu}
            onKeyDown={onKeyDown}
            onDragStart={onDragStart}
            onDragEnd={endDrag}
          />
        ))}
      </div>
      <div role="status" className="sr-only">
        {announcement}
      </div>

      <Tooltip label="Add account">
        {() => (
          <button
            type="button"
            aria-label="Add account"
            disabled={snap.recovery}
            onClick={() => openDialog({ kind: 'add' })}
            className="no-drag mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-dashed border-edge text-fg-dim enabled:hover:border-fg-mute enabled:hover:text-fg disabled:opacity-40"
          >
            <Icon name="plus" />
          </button>
        )}
      </Tooltip>

      <div className="flex-1" />
      <Tooltip label="Settings" hint={<Kbd>Ctrl ,</Kbd>}>
        {(describedBy) => (
          <button
            type="button"
            aria-label="Settings"
            aria-describedby={describedBy}
            onClick={() => openSettings()}
            className="no-drag flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-fg-dim hover:bg-bg-3 hover:text-fg"
          >
            <Icon name="settings" size={19} />
          </button>
        )}
      </Tooltip>
    </nav>
  )
}
