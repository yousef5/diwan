import { type IpcMainEvent, ipcMain, nativeImage } from 'electron'
import type { z } from 'zod'
import { type GuestChannel, type GuestPayload, guestChannels } from '../shared/ipc'
import type { AvatarFiles } from './avatars'
import { handleGuestAvatar } from './guest-avatar'
import { createOnlineSync } from './guest-online'
import { guardGuest, guestLimits } from './ipc-guard'
import { WA_ORIGIN } from './link-policy'
import type { Logger } from './log'
import type { Notifier } from './notifier'
import type { Registry } from './registry'
import type { StateHub } from './state'

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
    limits: guestLimits(),
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

  const online = createOnlineSync({
    getState: (id) => d.hub.runtimeOf(id).state,
    setState: (id, state) => d.hub.setRuntime(id, { state }),
    hasGuest: (id) => !!d.registry.guestOf(id),
    reloadGuest: (id) => {
      d.registry.guestOf(id)?.reload()
      return true
    },
    log: d.log,
  })
  on('guest:online', (id, p) => online.report(id, p.online))
  on('guest:avatar', (id, { dataUrl }) =>
    handleGuestAvatar(id, dataUrl, {
      account: (x) => d.hub.account(x),
      currentAvatar: (x) => d.hub.runtimeOf(x).avatar,
      decode: (u) => nativeImage.createFromDataURL(u),
      save: (x, img) => d.avatars.save(x, img),
      setAvatar: (x, url) => d.hub.setRuntime(x, { avatar: url }),
    }),
  )
  on('guest:notify', (id, payload) => d.notifier.show(id, payload))
  on('guest:notify-close', (id, { nid }) => d.notifier.close(id, nid))
}

export { forgetAvatar } from './guest-avatar'
