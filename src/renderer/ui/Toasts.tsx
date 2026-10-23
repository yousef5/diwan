import { type FocusEvent, useEffect, useRef, useState } from 'react'
import { Icon } from '../icons'
import { useUi } from '../state'

// Short messages in the bottom-right corner, mostly failures from `call`. Plain messages leave on
// their own after TOAST_MS; errors stay until dismissed. Hovering or focusing the stack pauses the
// timers, so a message can be read (or its Dismiss reached) without it vanishing.
//
// Screen readers get a separate, visually hidden status region that mirrors only the text: the
// visible stack, with its Dismiss buttons, is not a live region, so each message is announced once
// and politely, without "Dismiss, button" after it.
export function Toasts() {
  const toasts = useUi((s) => s.toasts)
  const dismiss = useUi((s) => s.dismissToast)
  const setPaused = useUi((s) => s.setToastsPaused)
  const ref = useRef<HTMLElement>(null)
  const [hover, setHover] = useState(false)
  const [focusIn, setFocusIn] = useState(false)

  // A dismissed toast takes the pointer or focus with it without a leave or blur event: re-check
  // whenever the stack changes, so a stale hover/focus can't pause the next message forever.
  useEffect(() => {
    if (toasts.length === 0) setHover(false)
    if (!ref.current?.contains(document.activeElement)) setFocusIn(false)
  }, [toasts])
  useEffect(() => setPaused(hover || focusIn), [hover, focusIn, setPaused])
  useEffect(() => () => setPaused(false), [setPaused])

  const onBlur = (e: FocusEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusIn(false)
  }

  return (
    <>
      <section
        ref={ref}
        aria-label="Messages"
        className="pointer-events-none fixed right-4 bottom-4 z-[60] flex flex-col items-end gap-2"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setFocusIn(true)}
        onBlur={onBlur}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex max-w-sm items-start gap-3 rounded-xl border border-line-strong bg-bg-4 py-3 pr-2.5 pl-4 text-[13px] text-fg shadow-xl"
          >
            <p dir="auto" className="bidi-plain m-0 min-w-0 flex-1 py-px break-words select-text">
              {t.text}
            </p>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(t.id)}
              className="-my-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-fg-mute hover:bg-bg-5 hover:text-fg"
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </section>
      {/* Not atomic: only the added message is read, not the whole list again. */}
      <div role="status" aria-atomic="false" className="sr-only">
        {toasts.map((t) => (
          <p key={t.id} dir="auto">
            {t.text}
          </p>
        ))}
      </div>
    </>
  )
}
