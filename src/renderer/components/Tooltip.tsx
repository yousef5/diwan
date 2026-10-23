import {
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

const GAP = 14

// A label to the right of a rail control, shown on hover and on keyboard focus (not on the focus a
// mouse click leaves behind, or it would stick after the pointer leaves). Esc or a right-click
// hides it until the pointer or focus leaves. It is position: fixed from the trigger's box, so the
// rail's scrolling tile list can't clip it. While open it follows the trigger: it re-measures after
// every render (a keyboard reorder moves the tile) and on any scroll or window resize.
//
// `children` receives the id to put in the trigger's aria-describedby: it names the hint (the
// shortcut), since the label already is the trigger's accessible name. No hint, no description.
export function Tooltip({
  label,
  hint,
  children,
}: {
  label: string
  hint?: ReactNode
  children: (describedBy: string | undefined) => ReactNode
}) {
  const id = useId()
  const ref = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState(false)
  const [focus, setFocus] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const open = (hover || focus) && !dismissed

  // Only a real move sets state, so measuring after every render can't loop.
  const place = useCallback(() => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const top = r.top + r.height / 2
    const left = r.right + GAP
    setPos((p) => (p.top === top && p.left === left ? p : { top, left }))
  }, [])

  useLayoutEffect(() => {
    if (open) place()
  })
  useEffect(() => {
    if (!open) return
    // Capture: a scroll in any container (the rail's tile list) doesn't bubble to window.
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, place])
  const onFocus = (e: FocusEvent) => {
    if (isFocusVisible(e.target)) setFocus(true)
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && open) setDismissed(true)
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover/focus only show the tooltip; the child is the control
    <div
      ref={ref}
      className="relative flex justify-center"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false)
        setDismissed(false)
      }}
      onFocus={onFocus}
      onBlur={() => {
        setFocus(false)
        setDismissed(false)
      }}
      onKeyDown={onKeyDown}
      onContextMenu={() => setDismissed(true)}
    >
      {children(hint ? id : undefined)}
      <div
        role="tooltip"
        hidden={!open}
        style={pos}
        className="pointer-events-none fixed z-40 flex -translate-y-1/2 items-center gap-2.5 whitespace-nowrap rounded-lg border border-line-strong bg-bg-4 px-2.5 py-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
      >
        <span dir="auto" className="bidi-plain max-w-64 truncate text-[13px] font-medium text-fg-strong">
          {label}
        </span>
        {hint && <span id={id}>{hint}</span>}
      </div>
    </div>
  )
}

// jsdom (tests) doesn't know :focus-visible; treat any focus there as keyboard focus.
function isFocusVisible(el: EventTarget): boolean {
  try {
    return (el as Element).matches(':focus-visible')
  } catch {
    return true
  }
}
