import { Icon } from '../icons'
import { useUi } from '../state'

// Short messages in the bottom-right corner, mostly failures from `call`. They leave on their own
// (TOAST_MS in state.ts) or with the close button. The region is a polite live region, so screen
// readers read each one without interrupting.
export function Toasts() {
  const toasts = useUi((s) => s.toasts)
  const dismiss = useUi((s) => s.dismissToast)
  return (
    <section
      aria-label="Messages"
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-4 z-[60] flex flex-col items-end gap-2"
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
  )
}
