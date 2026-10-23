import { useEffect, useRef } from 'react'

// Esc closes the topmost layer only: a dialog over the settings page, a menu over a dialog.
// Every enabled useEscape joins a stack in mount/enable order and one window listener calls the
// newest. A handler further down (say, a text field clearing itself) can opt out with
// preventDefault. Keys that are part of an IME composition are left alone.
// Order is by enabling, not by mounting: a layer that is disabled and enabled again (say, a menu
// that closes and reopens) moves to the top of the stack, above layers enabled in between.
type Entry = { current: () => void }

const stack: Entry[] = []

function onKeyDown(e: KeyboardEvent): void {
  if (e.key !== 'Escape' || e.isComposing || e.defaultPrevented) return
  const top = stack[stack.length - 1]
  if (!top) return
  e.preventDefault()
  e.stopPropagation()
  top.current()
}

export function useEscape(onEscape: () => void, enabled = true): void {
  // The newest callback is read at key time, so a new function identity each render doesn't
  // move this layer in the stack.
  const ref = useRef(onEscape)
  useEffect(() => {
    ref.current = onEscape
  })

  useEffect(() => {
    if (!enabled) return
    const entry: Entry = { current: () => ref.current() }
    if (stack.length === 0) window.addEventListener('keydown', onKeyDown)
    stack.push(entry)
    return () => {
      stack.splice(stack.indexOf(entry), 1)
      if (stack.length === 0) window.removeEventListener('keydown', onKeyDown)
    }
  }, [enabled])
}
