import { contextBridge, ipcRenderer } from 'electron'
import type { GuestChannel, GuestPayload, NOTIFY_CLICK } from '../shared/ipc'
import { findAvatarDataUrl } from './avatar'
import { clickNid, tokenBucket, watchAvatar } from './guest-logic'
import { installNotificationShim } from './notification-shim'

// Runs inside every web.whatsapp.com page (isolated world, sandboxed). It only reports: it never
// clicks, types or sends anything, except replaying WhatsApp's own notification onclick.
// Main validates every message again (sender, frame, schema, rate limits).

// Channel names are type-checked literals: a value import from shared/ipc would bundle zod.
function send<C extends GuestChannel>(channel: C, payload: GuestPayload<C>): void {
  ipcRenderer.send(channel, payload)
}
const CLICK: typeof NOTIFY_CLICK = 'guest:notify-click'

// The shim (installed in the main world, before any page script) builds the full payload; main's
// zod schema decides whether it is acceptable. Both calls pass a token bucket first, far above what
// WhatsApp ever sends: a page looping on the bridge is dropped here, silently, before any IPC.
// Main keeps its own (stricter) limits as well.
const allowShow = tokenBucket(60, 10_000)
const allowClose = tokenBucket(400, 10_000)
contextBridge.exposeInMainWorld('__diwanNotify', {
  show: (payload: unknown) => {
    if (allowShow()) ipcRenderer.send('guest:notify' satisfies GuestChannel, payload)
  },
  // never String() an arbitrary page value: a huge or hostile object would be stringified here
  close: (nid: unknown) => {
    if (allowClose()) send('guest:notify-close', { nid: typeof nid === 'string' ? nid.slice(0, 64) : '' })
  },
})
contextBridge.executeInMainWorld({ func: installNotificationShim })

ipcRenderer.on(CLICK, (_event, msg: unknown) => {
  const nid = clickNid(msg)
  if (!nid) return
  contextBridge.executeInMainWorld({
    func: (n: string) => {
      ;(window as unknown as { __diwanClick?: (x: string) => void }).__diwanClick?.(n)
    },
    args: [nid],
  })
})

const reportOnline = () => send('guest:online', { online: navigator.onLine })
window.addEventListener('online', reportOnline)
window.addEventListener('offline', reportOnline)
// A page served from WhatsApp's service worker can come up with no network at all.
if (!navigator.onLine) reportOnline()

window.addEventListener('DOMContentLoaded', () => {
  watchAvatar(
    () => findAvatarDataUrl(document),
    (dataUrl) => send('guest:avatar', { dataUrl }),
  )
})
