import { type IpcMainEvent, ipcMain, nativeImage } from 'electron'
import type { z } from 'zod'
import { type GuestChannel, type GuestPayload, guestChannels } from '../shared/ipc'
import type { AvatarFiles } from './avatars'
import { guardGuest } from './ipc-guard'
import { WA_ORIGIN } from './link-policy'
import type { Logger } from './log'
import type { Notifier } from './notifier'
import { createRateLimiter } from './rate-limit'
import type { Registry } from './registry'
import type { StateHub } from './state'

const AVATAR_INTERVAL_MS = 30_000
const ONLINE_DEBOUNCE_MS = 1000
const RELOAD_INTERVAL_MS = 10_000

function isWhatsAppMainFrame(e: IpcMainEvent): boolean {
  const f = e.senderFrame
  if (!f || f !== e.sender.mainFrame) return false
  try {
    return new URL(f.url).origin === WA_ORIGIN
  } catch {
    return false
  }
}

export function registerGuestIpc(d: {
  hub: StateHub
  registry: Registry
  notifier: Notifier
  avatars: AvatarFiles
  log: Logger
}): void {
  const wrap = guardGuest<IpcMainEvent>({
    accountOf: (id) => d.registry.accountOf(id),
    isWhatsAppMainFrame,
    log: d.log,
    limits: { 'guest:avatar': createRateLimiter(1, AVATAR_INTERVAL_MS) },
  })
  function on<C extends GuestChannel>(
    channel: C,
    fn: (accountId: string, payload: GuestPayload<C>, event: IpcMainEvent) => void,
  ): void {
    ipcMain.on(
      channel,
      wrap(
        channel,
        guestChannels[channel] as z.ZodType,
        fn as (id: string, p: unknown, e: IpcMainEvent) => void,
      ),
    )
  }

  const onlineTimers = new Map<string, NodeJS.Timeout>()
  const canReload = createRateLimiter(1, RELOAD_INTERVAL_MS)
  const lastAvatar = new Map<string, string>()

  function applyOnline(id: string, online: boolean): void {
    try {
      const state = d.hub.runtimeOf(id).state
      if (!online) {
        if (state === 'loggingOut') return
        d.hub.setRuntime(id, { state: 'offline' })
      } else if (state === 'offline' || state === 'failed') {
        const guest = d.registry.guestOf(id)
        if (!guest || !canReload(id)) return
        d.hub.setRuntime(id, { state: 'loading' })
        guest.reload()
      }
    } catch (e) {
      d.log.error('guest:online failed', e)
    }
  }

  // Act on the last reported value after a quiet second, so flapping can't thrash reloads.
  on('guest:online', (id, { online }) => {
    const t = onlineTimers.get(id)
    if (t) clearTimeout(t)
    onlineTimers.set(
      id,
      setTimeout(() => {
        onlineTimers.delete(id)
        applyOnline(id, online)
      }, ONLINE_DEBOUNCE_MS),
    )
  })
  on('guest:avatar', (id, { dataUrl }) => {
    if (d.hub.account(id)?.customAvatar) return
    if (lastAvatar.get(id) === dataUrl) return
    const image = nativeImage.createFromDataURL(dataUrl) // dimensions already capped by the schema
    if (image.isEmpty()) return
    const url = d.avatars.save(id, image)
    if (!url) return
    lastAvatar.set(id, dataUrl)
    d.hub.setRuntime(id, { avatar: url })
  })
  on('guest:notify', (id, payload) => d.notifier.show(id, payload))
  on('guest:notify-close', (id, { nid }) => d.notifier.close(id, nid))
}
