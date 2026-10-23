import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react'
import { activeTile, focusFirst, mainRegion } from '../focus'
import { useUi } from '../state'
import { useEscape } from './useEscape'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// :disabled also catches controls inside a disabled <fieldset>; checkVisibility() catches
// display:none and content-visibility from CSS (jsdom lacks it, hence the optional call).
const focusables = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) =>
      !el.matches(':disabled') &&
      !el.closest('[hidden], [inert], [aria-hidden="true"]') &&
      el.checkVisibility?.() !== false,
  )

// A modal dialog. Focus moves in when it opens (to [data-autofocus], else the first control, else
// the panel), Tab and Shift+Tab stay inside, Esc or a click on the backdrop closes it. Closing
// defaults to clearing the UI store's dialog.
//
// On close, focus goes back to whatever had it before, if that is still in the document. A dialog
// opened from the account menu was opened by a menu item that is already gone, so then it tries
// `returnFocus()` (say, that account's rail tile), then the active rail tile, then the main
// region. Focus never drops to <body>.
export function Dialog({
  title,
  children,
  footer,
  width = 440,
  onClose,
  returnFocus,
}: {
  title: string
  children: ReactNode
  footer: ReactNode
  width?: number
  onClose?: () => void
  returnFocus?: () => HTMLElement | null
}) {
  const close = useCallback(() => (onClose ? onClose() : useUi.getState().openDialog(null)), [onClose])
  useEscape(close)
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)
  // Read during the first render, before any child autoFocus runs in the commit.
  const [returnTo] = useState(() => document.activeElement)
  // Read at close time, so the newest callback wins.
  const returnFocusRef = useRef(returnFocus)
  returnFocusRef.current = returnFocus

  useEffect(() => {
    const root = panel.current
    if (root && !root.contains(document.activeElement)) {
      const target = root.querySelector<HTMLElement>('[data-autofocus]') ?? focusables(root)[0] ?? root
      target.focus()
    }
    return () => {
      focusFirst([
        () => (returnTo === document.body ? null : returnTo),
        () => returnFocusRef.current?.(),
        activeTile,
        mainRegion,
      ])
    }
  }, [returnTo])

  const trapTab = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !panel.current) return
    const items = focusables(panel.current)
    if (items.length === 0) {
      e.preventDefault()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (e.shiftKey && (active === first || active === panel.current)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    // The backdrop's mousedown is a pointer-only convenience; keyboards close with Esc (useEscape)
    // or the footer buttons.
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click-to-close; Esc is the keyboard path
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{ width }}
        onKeyDown={trapTab}
        className="flex max-h-full max-w-full flex-col rounded-2xl border border-line-strong bg-linear-to-b from-bg-3 to-bg-2 shadow-[0_24px_64px_rgb(0_0_0/0.55)] outline-none"
      >
        <h2 id={titleId} className="px-6 pt-5 text-[16px] font-semibold text-fg-strong">
          {title}
        </h2>
        <div className="min-h-0 overflow-auto px-6 pt-3 pb-5 text-[13px] leading-relaxed text-fg-dim">
          {children}
        </div>
        <div className="flex justify-end gap-2 rounded-b-2xl border-t border-line bg-black/15 px-6 py-3.5">
          {footer}
        </div>
      </div>
    </div>
  )
}
