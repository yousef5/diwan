import { useEffect, useRef } from 'react'
import { stageMayTakeFocus } from '../focus'
import { useUi } from '../state'

export const WHATSAPP_URL = 'https://web.whatsapp.com/'

// Exactly what main's will-attach-webview guard (isAllowedGuest) accepts: a web.whatsapp.com src
// and a persist:acc-<uuid> partition, nothing in `webpreferences`. `allowpopups` lets window.open
// and target=_blank reach main's setWindowOpenHandler (which always denies and opens the link
// itself); without it Chromium drops them silently. React only writes a non-boolean value for an
// attribute it doesn't know, hence the string.
const POPUPS = { allowpopups: 'true' } as unknown as { allowpopups: boolean }

// One <webview> per account, all mounted at once and stacked. Switching only changes visibility:
// unmounting (or moving the node in the DOM) would destroy the guest and reload WhatsApp. Inactive
// ones are hidden with visibility (not display:none) so they keep their size and switching never
// reflows WhatsApp, and they are inert: no focus, no pointer input. The active one is inert too
// while a status overlay covers it. A new `mountKey` replaces the element: a fresh guest (remount).
export function GuestView({
  id,
  active,
  covered,
  mountKey,
}: {
  id: string
  active: boolean
  covered: boolean
  mountKey: number
}) {
  const ref = useRef<HTMLWebViewElement>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: a remount (new mountKey) replaces the element, which must take focus again
  useEffect(() => {
    if (!active || covered) return
    const s = useUi.getState()
    if (stageMayTakeFocus(s.settingsOpen || s.dialog !== null || s.menu !== null)) ref.current?.focus()
  }, [active, covered, mountKey])
  return (
    <webview
      key={mountKey}
      ref={ref}
      data-account={id}
      partition={`persist:acc-${id}`}
      src={WHATSAPP_URL}
      {...POPUPS}
      inert={!active || covered}
      className={`absolute inset-0 h-full w-full ${active ? 'visible z-10' : 'invisible'}`}
    />
  )
}
