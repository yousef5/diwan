import { ipcMain, nativeImage, type WebContents } from 'electron'
import { type GuestChannel, type GuestPayload, guestChannels } from '../shared/ipc'
import type { AvatarFiles } from './avatars'
import type { Logger } from './log'
import type { Notifier } from './notifier'
import type { Registry } from './registry'
import type { StateHub } from './state'

export function registerGuestIpc(d: {
  hub: StateHub
  registry: Registry
  notifier: Notifier
  avatars: AvatarFiles
  log: Logger
}): void {
  function on<C extends GuestChannel>(
    channel: C,
    fn: (accountId: string, payload: GuestPayload<C>, sender: WebContents) => void,
  ): void {
    ipcMain.on(channel, (event, raw) => {
      const accountId = d.registry.accountOf(event.sender.id)
      if (!accountId) return
      const parsed = guestChannels[channel].safeParse(raw)
      if (!parsed.success) {
        d.log.warn('invalid guest payload', { channel })
        return
      }
      fn(accountId, parsed.data as GuestPayload<C>, event.sender)
    })
  }

  on('guest:online', (id, { online }, sender) => {
    const state = d.hub.runtimeOf(id).state
    if (!online) d.hub.setRuntime(id, { state: 'offline' })
    else if (state === 'offline' || state === 'failed') {
      d.hub.setRuntime(id, { state: 'loading' })
      sender.reload()
    }
  })
  on('guest:avatar', (id, { dataUrl }) => {
    if (d.hub.account(id)?.customAvatar) return
    const image = nativeImage.createFromDataURL(dataUrl) // dimensions already capped by the schema
    if (image.isEmpty()) return
    const url = d.avatars.save(id, image)
    if (url) d.hub.setRuntime(id, { avatar: url })
  })
  on('guest:notify', (id, payload) => d.notifier.show(id, payload))
  on('guest:notify-close', (id, { nid }) => d.notifier.close(id, nid))
}
