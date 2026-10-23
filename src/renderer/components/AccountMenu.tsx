import { Fragment, type KeyboardEvent, useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { call } from '../api'
import { accountTile, activeTile, focusFirst, mainRegion } from '../focus'
import { Icon, type IconName } from '../icons'
import { useUi } from '../state'
import { useEscape } from '../ui/useEscape'

// Keeps a user-typed name from reordering the text around it ("Remove “محمد”?").
export const isolate = (name: string) => `⁨${name}⁩`

// Typeahead: letters typed within this long of each other build one search string.
const TYPEAHEAD_MS = 600
// Space kept between the menu and the window edge.
const EDGE = 8

export interface MenuItem {
  icon: IconName
  label: string
  danger?: boolean
  disabled?: boolean
  // A separator is drawn above this item.
  divider?: boolean
  run(): void
}

// Where a menu of size w×h opened at (x, y) goes so it stays inside a vw×vh window: shifted left
// at the right edge, and opened upwards when there is no room below.
export function placeMenu(x: number, y: number, w: number, h: number, vw: number, vh: number) {
  const left = Math.max(EDGE, Math.min(x, vw - w - EDGE))
  const top = y + h <= vh - EDGE ? y : Math.max(EDGE, Math.min(y - h, vh - h - EDGE))
  return { left, top }
}

// The next item for typeahead: the same letter typed again cycles through the items starting with
// it; a longer string searches from the current item on.
export function typeaheadIndex(labels: string[], current: number, query: string): number {
  const q = query.toLowerCase()
  const n = labels.length
  const cycling = q.length > 1 && [...q].every((c) => c === q[0])
  const needle = cycling ? q[0] : q
  const start = cycling || q.length === 1 ? current + 1 : current
  for (let k = 0; k < n; k++) {
    const i = (((start + k) % n) + n) % n
    if (labels[i].toLowerCase().startsWith(needle)) return i
  }
  return -1
}

// The account menu, opened from a rail tile (right-click, Shift+F10, the menu key) or the context
// bar's "More" button. A WAI-ARIA menu: focus moves to the first item, ↑/↓ wrap, Home/End jump,
// letters jump to a matching item, Enter/Space activate. Esc and Tab close it and put focus back
// where it was; a click outside, or focus leaving it (into WhatsApp, another window), just closes.
export function AccountMenu() {
  const menu = useUi((s) => s.menu)
  const account = useUi((s) => s.snap?.accounts.find((a) => a.id === s.menu?.id))
  const state = useUi((s) => (s.menu ? s.snap?.runtime[s.menu.id]?.state : undefined))
  const recovery = useUi((s) => s.snap?.recovery === true)
  const openMenu = useUi((s) => s.openMenu)
  const openDialog = useUi((s) => s.openDialog)
  const box = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  // What had focus when the menu opened (a rail tile, the "More" button, the WhatsApp page).
  const opener = useRef<Element | null>(null)
  const typed = useRef({ text: '', at: Number.NEGATIVE_INFINITY })
  const open = !!menu && !!account

  const close = useCallback(() => {
    if (useUi.getState().menu) openMenu(null)
  }, [openMenu])
  // Close and hand focus back: to the opener, else that account's tile, else the active tile.
  const closeAndReturn = useCallback(() => {
    const id = useUi.getState().menu?.id
    const back = opener.current
    close()
    focusFirst([() => (back === document.body ? null : back), () => accountTile(id), activeTile, mainRegion])
  }, [close])
  useEscape(closeAndReturn, open)

  // Position (clamped to the window) and initial focus, before the first paint.
  useLayoutEffect(() => {
    if (!menu || !account) return
    const el = box.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const { left, top } = placeMenu(menu.x, menu.y, r.width, r.height, window.innerWidth, window.innerHeight)
    el.style.left = `${left}px`
    el.style.top = `${top}px`
  })
  useLayoutEffect(() => {
    if (!menu) return
    const prev = document.activeElement
    if (!box.current?.contains(prev)) opener.current = prev
    list.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
  }, [menu])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) close()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('blur', close)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('blur', close)
      window.removeEventListener('resize', close)
    }
  }, [open, close])

  if (!menu || !account) return null

  const id = account.id
  const name = account.name
  const items: MenuItem[] = [
    {
      icon: 'pencil',
      label: 'Edit name and colour…',
      disabled: recovery,
      run: () => openDialog({ kind: 'edit', id }),
    },
    {
      icon: 'image',
      label: 'Change picture…',
      disabled: recovery,
      run: () => void call('account:pickAvatar', { id }),
    },
    ...(account.customAvatar
      ? [
          {
            icon: 'x' as const,
            label: 'Use WhatsApp picture',
            disabled: recovery,
            run: () => void call('account:clearAvatar', { id }),
          },
        ]
      : []),
    {
      icon: account.muted ? 'bell' : 'bellOff',
      label: account.muted ? 'Unmute notifications' : 'Mute notifications',
      disabled: recovery,
      run: () => void call('account:update', { id, patch: { muted: !account.muted } }),
    },
    { icon: 'refresh', label: 'Reload', run: () => void call('account:reload', { id }) },
    {
      icon: 'logOut',
      label: 'Log out…',
      divider: true,
      disabled: state === 'loggingOut',
      run: () =>
        openDialog({
          kind: 'confirm',
          accountId: id,
          title: `Log out of “${isolate(name)}”?`,
          body: 'Diwan forgets this WhatsApp login. The account stays in the rail and shows a new QR code to scan.',
          confirmLabel: 'Log out',
          danger: false,
          onConfirm: () => void call('account:logout', { id }),
        }),
    },
    {
      icon: 'trash',
      label: 'Remove account…',
      danger: true,
      disabled: recovery,
      run: () =>
        openDialog({
          kind: 'confirm',
          accountId: id,
          title: `Remove “${isolate(name)}”?`,
          body: 'Diwan deletes this account and its saved WhatsApp data from this computer. Your chats stay on your phone.',
          confirmLabel: 'Remove',
          danger: true,
          onConfirm: () => void call('account:remove', { id }),
        }),
    },
  ]

  const nodes = () => Array.from(list.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
  const focusAt = (i: number) => {
    const all = nodes()
    all[((i % all.length) + all.length) % all.length]?.focus()
  }

  const activate = (item: MenuItem) => {
    if (item.disabled) return
    // Focus goes back first, so a dialog the item opens returns focus there when it closes.
    closeAndReturn()
    item.run()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const all = nodes()
    const at = all.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'ArrowDown') focusAt(at + 1)
    else if (e.key === 'ArrowUp') focusAt(at < 0 ? -1 : at - 1)
    else if (e.key === 'Home') focusAt(0)
    else if (e.key === 'End') focusAt(-1)
    else if (e.key === 'Tab') closeAndReturn()
    else if (e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const now = performance.now()
      const t = typed.current
      t.text = now - t.at < TYPEAHEAD_MS ? t.text + e.key : e.key
      t.at = now
      const next = typeaheadIndex(
        items.map((item) => item.label),
        at,
        t.text,
      )
      if (next >= 0) focusAt(next)
    } else return
    e.preventDefault()
  }

  return (
    <div
      ref={box}
      data-testid="account-menu"
      style={{ left: menu.x, top: menu.y, maxHeight: `calc(100vh - ${2 * EDGE}px)` }}
      className="no-drag fixed z-50 flex w-[228px] flex-col overflow-y-auto rounded-xl border border-line-strong bg-bg-4 p-1.5 shadow-[0_16px_40px_rgb(0_0_0/0.5)]"
    >
      <div aria-hidden="true" className="flex items-center gap-2 px-2.5 pt-1 pb-1.5">
        <span style={{ background: account.color }} className="h-2 w-2 shrink-0 rounded-full" />
        <span dir="auto" className="bidi-plain min-w-0 truncate text-[12px] font-medium text-fg-dim">
          {name}
        </span>
      </div>
      <div
        ref={list}
        role="menu"
        aria-label={`Actions for ${name}`}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        onBlur={(e) => {
          if (!box.current?.contains(e.relatedTarget as Node | null)) close()
        }}
      >
        {items.map((item) => (
          <Fragment key={item.label}>
            {item.divider && <hr className="mx-1 my-1 h-px border-0 bg-line-strong" />}
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              aria-disabled={item.disabled ? 'true' : undefined}
              onClick={() => activate(item)}
              onMouseEnter={(e) => e.currentTarget.focus({ preventScroll: true })}
              className={`flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] focus-visible:-outline-offset-2 aria-disabled:cursor-default aria-disabled:opacity-45 not-aria-disabled:hover:bg-bg-5 not-aria-disabled:focus:bg-bg-5 ${
                item.danger ? 'text-danger-soft' : 'text-fg'
              }`}
            >
              <Icon name={item.icon} size={15} className={item.danger ? '' : 'text-fg-dim'} />
              {item.label}
            </button>
          </Fragment>
        ))}
      </div>
    </div>
  )
}
