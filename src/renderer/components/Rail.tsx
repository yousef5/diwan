import { type DragEvent, type KeyboardEvent, type MouseEvent, useEffect, useRef, useState } from 'react'
import type { AccountRuntime } from '../../shared/types'
import { call } from '../api'
import { accountTile } from '../focus'
import { DiwanMark, Icon } from '../icons'
import { useUi } from '../state'
import { Kbd } from '../ui/Kbd'
import { AccountTile } from './AccountTile'
import { Tooltip } from './Tooltip'

const NO_RUNTIME: AccountRuntime = { state: 'loading', unread: 0, avatar: null }

// `ids` with `id` moved to just before or after `target`.
export function moveId(ids: string[], id: string, target: string, where: 'before' | 'after'): string[] {
  const rest = ids.filter((x) => x !== id)
  const at = rest.indexOf(target)
  if (at < 0 || id === target) return ids
  rest.splice(at + (where === 'after' ? 1 : 0), 0, id)
  return rest
}

// The 68 px account rail (design B): logo, divider, account tiles, dashed "add", settings at the
// bottom. Tiles reorder by drag, or by Alt+↑/↓ on a focused tile (the keyboard path for the drag).
// Right-click or the context-menu key (Shift+F10) opens the account menu.
export function Rail() {
  const snap = useUi((s) => s.snap)
  const openDialog = useUi((s) => s.openDialog)
  const openMenu = useUi((s) => s.openMenu)
  const openSettings = useUi((s) => s.openSettings)
  const [dragId, setDragId] = useState<string | null>(null)
  const [drop, setDrop] = useState<{ id: string; where: 'before' | 'after' } | null>(null)
  // A tile moved by keyboard: React moves its DOM node, which drops focus, so put it back once the
  // new order arrives.
  const refocus = useRef<string | null>(null)
  const order = snap?.accounts.map((a) => a.id).join('\n')

  useEffect(() => {
    const id = refocus.current
    if (!id || order === undefined) return
    refocus.current = null
    accountTile(id)?.focus()
  }, [order])

  if (!snap) return null
  const { accounts, runtime, activeId } = snap
  const ids = accounts.map((a) => a.id)

  const endDrag = () => {
    setDragId(null)
    setDrop(null)
  }
  const onDragOver = (id: string) => (e: DragEvent) => {
    if (!dragId) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const where = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
    if (drop?.id !== id || drop.where !== where) setDrop({ id, where })
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    if (dragId && drop && dragId !== drop.id) {
      const next = moveId(ids, dragId, drop.id, drop.where)
      if (next.join('\n') !== ids.join('\n')) void call('account:reorder', { ids: next })
    }
    endDrag()
  }
  // A keyboard-opened context menu (Shift+F10, the menu key) can come with no pointer position;
  // anchor it beside the tile instead of the window corner.
  const onMenu = (id: string) => (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    if (e.clientX === 0 && e.clientY === 0) {
      const r = e.currentTarget.getBoundingClientRect()
      openMenu({ id, x: r.right + 8, y: r.top })
    } else {
      openMenu({ id, x: e.clientX, y: e.clientY })
    }
  }
  const onTileKey = (id: string, i: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const up = e.key === 'ArrowUp'
    if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || (!up && e.key !== 'ArrowDown')) return
    e.preventDefault()
    const to = up ? i - 1 : i + 1
    if (to < 0 || to >= ids.length) return
    refocus.current = id
    void call('account:reorder', { ids: moveId(ids, id, ids[to], up ? 'before' : 'after') })
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
      <div className="no-drag -my-2 flex min-h-0 flex-col items-center gap-2.5 overflow-y-auto py-2 [scrollbar-width:none]">
        {accounts.map((a, i) => (
          <AccountTile
            key={a.id}
            account={a}
            runtime={runtime[a.id] ?? NO_RUNTIME}
            index={i}
            active={a.id === activeId}
            dropHint={drop?.id === a.id && dragId !== a.id ? drop.where : null}
            onSelect={() => void call('account:activate', { id: a.id })}
            onMenu={onMenu(a.id)}
            onKeyDown={onTileKey(a.id, i)}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/plain', a.id)
              setDragId(a.id)
            }}
            onDragOver={onDragOver(a.id)}
            onDrop={onDrop}
            onDragEnd={endDrag}
          />
        ))}
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
