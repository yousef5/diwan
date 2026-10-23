import { useEffect, useRef, useState } from 'react'
import type { Account } from '../../shared/types'
import { useUi } from '../state'
import { ContextBar } from './ContextBar'
import { EmptyState } from './EmptyState'
import { GuestView } from './GuestView'
import { OVERLAY, StatusOverlay } from './StatusOverlay'

// Webviews in a fixed order (by id), not rail order: React moves a keyed node when the order of
// its siblings changes, and moving a <webview> in the DOM destroys its guest (WhatsApp reloads).
// With a stable sort, adding or removing an account only inserts or removes its own node.
const byId = (a: Account, b: Account) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

// main → shell `remount`: replace that account's webview with a fresh guest. Honoured in any
// account state. Main sends it after the snapshot it follows from (sendShell flushes first): after
// a logout it arrives with the account already back in 'loading', so the new webview mounts at once;
// while an account is still 'loggingOut' (and so not mounted) the bumped key simply waits.
export function useRemountCommands(): void {
  useEffect(
    () =>
      window.diwan.onCommand((c) => {
        if (c.type === 'remount') useUi.getState().bumpRemount(c.id)
      }),
    [],
  )
}

// What the status region says when the active account's page changes state: the overlay's title
// when it covers the page, "connected" when that account recovers, and nothing for a plain switch
// to a healthy account.
function useAnnouncement(id: string | undefined, name: string, state: string | undefined): string {
  const [said, setSaid] = useState('')
  const problemFor = useRef<string | null>(null)
  const lastId = useRef<string | undefined>(undefined)
  useEffect(() => {
    const switched = lastId.current !== id
    lastId.current = id
    if (!id || !state) {
      problemFor.current = null
      setSaid('')
      return
    }
    const copy = OVERLAY[state as keyof typeof OVERLAY]
    if (copy) {
      problemFor.current = id
      setSaid(`${name}: ${copy.title}`)
    } else if (state === 'ready' && problemFor.current === id) {
      problemFor.current = null
      setSaid(`${name}: connected`)
    } else if (switched) {
      problemFor.current = null
      setSaid('')
    }
  }, [id, name, state])
  return said
}

// Everything right of the rail: the context bar and the WhatsApp pages. Every account's webview
// stays mounted (only the active one is visible); an account that is logging out has none, until
// main's remount brings a fresh one. <main> is focusable (tabindex -1): the focus fallback when
// whatever had focus goes away.
export function Stage() {
  const snap = useUi((s) => s.snap)
  const remount = useUi((s) => s.remount)
  useRemountCommands()
  const active = snap?.accounts.find((a) => a.id === snap.activeId)
  const activeState = active ? (snap?.runtime[active.id]?.state ?? 'loading') : undefined
  const said = useAnnouncement(active?.id, active?.name ?? '', activeState)

  const guests = (snap?.accounts ?? []).filter((a) => snap?.runtime[a.id]?.state !== 'loggingOut').sort(byId)

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      {active && <ContextBar />}
      <main tabIndex={-1} className="relative flex min-h-0 flex-1 bg-bg-0 outline-none">
        {snap && snap.accounts.length === 0 && <EmptyState />}
        {guests.map((a) => (
          <GuestView
            key={a.id}
            id={a.id}
            active={a.id === active?.id}
            covered={a.id === active?.id && activeState !== undefined && OVERLAY[activeState] !== undefined}
            mountKey={remount[a.id] ?? 0}
          />
        ))}
        {active && activeState && <StatusOverlay key={active.id} id={active.id} state={activeState} />}
      </main>
      <div role="status" className="sr-only">
        {said}
      </div>
    </section>
  )
}
