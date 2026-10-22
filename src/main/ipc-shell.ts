import { randomUUID } from 'node:crypto'
import { type BrowserWindow, dialog, ipcMain, session, shell } from 'electron'
import type { z } from 'zod'
import { type ShellChannel, shellChannels } from '../shared/ipc'
import type { ImportPlan, ImportResult, ShellCommand } from '../shared/types'
import type { AvatarFiles } from './avatars'
import { partitionOf } from './guest-config'
import { resetCrashes } from './guests'
import type { Logger } from './log'
import type { Paths } from './paths'
import type { Registry } from './registry'
import type { StateHub } from './state'
import type { TrayController } from './tray'

export interface ShellIpcDeps {
  hub: StateHub
  registry: Registry
  avatars: AvatarFiles
  tray: TrayController
  paths: Paths
  log: Logger
  win(): BrowserWindow | null
  setupSession(id: string): void
  setZoom(id: string, delta: 1 | -1 | 0): void
  removeAccount(id: string): Promise<void>
  sendShell(cmd: ShellCommand): void
  planImport(): ImportPlan
  applyImport(): Promise<ImportResult>
}

export function registerShellIpc(d: ShellIpcDeps): void {
  function handle<C extends ShellChannel>(
    channel: C,
    fn: (payload: z.output<(typeof shellChannels)[C]>) => unknown,
  ): void {
    ipcMain.handle(channel, async (event, raw) => {
      const w = d.win()
      if (!w || event.sender.id !== w.webContents.id) throw new Error(`${channel}: forbidden`)
      const parsed = shellChannels[channel].safeParse(raw)
      if (!parsed.success) {
        d.log.warn('invalid shell payload', { channel })
        throw new Error(`${channel}: invalid payload`)
      }
      return fn(parsed.data as z.output<(typeof shellChannels)[C]>)
    })
  }

  handle('state:get', () => d.hub.snapshot())

  handle('account:add', ({ name, color }) => {
    const id = randomUUID()
    d.setupSession(id)
    return d.hub.addAccount(name, color, id)
  })
  handle('account:update', ({ id, patch }) => d.hub.updateAccount(id, patch))
  handle('account:remove', ({ id }) => d.removeAccount(id))
  handle('account:reorder', ({ ids }) => d.hub.reorder(ids))
  handle('account:activate', ({ id }) => {
    d.hub.setActive(id)
  })
  handle('account:zoom', ({ id, delta }) => d.setZoom(id, delta))
  handle('account:reload', ({ id }) => {
    resetCrashes(id) // a manual retry starts the crash backoff over
    const guest = d.registry.guestOf(id)
    const state = d.hub.runtimeOf(id).state
    if (!guest || state === 'hung') {
      d.sendShell({ type: 'remount', id })
      return
    }
    d.hub.setRuntime(id, { state: 'loading' })
    guest.reload()
  })
  handle('account:logout', async ({ id }) => {
    await session.fromPartition(partitionOf(id)).clearStorageData()
    d.avatars.remove(id)
    d.hub.updateAccount(id, { customAvatar: false })
    d.hub.setRuntime(id, { avatar: null, unread: 0, state: 'loading' })
    d.sendShell({ type: 'remount', id })
  })
  handle('account:pickAvatar', async ({ id }) => {
    const w = d.win()
    if (!w) return
    const r = await dialog.showOpenDialog(w, {
      title: 'Choose a picture',
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }],
      properties: ['openFile'],
    })
    const file = r.filePaths[0]
    if (r.canceled || !file) return
    const url = d.avatars.saveFromFile(id, file) // size + header-dimension checked before decoding
    if (!url) return
    d.hub.updateAccount(id, { customAvatar: true })
    d.hub.setRuntime(id, { avatar: url })
  })
  handle('account:clearAvatar', ({ id }) => {
    d.avatars.remove(id)
    d.hub.updateAccount(id, { customAvatar: false })
    d.hub.setRuntime(id, { avatar: null })
  })

  handle('settings:update', (patch) => d.hub.updateSettings(patch))

  handle('importer:plan', () => d.planImport())
  handle('importer:apply', () => d.applyImport())

  handle('app:openDataFolder', async () => {
    await shell.openPath(d.paths.userData)
  })
  handle('app:startFresh', () => {
    d.hub.store.startFresh()
    d.hub.notify()
  })

  handle('tray:setBadges', (images) => d.tray.setBadges(images))

  handle('window:minimize', () => d.win()?.minimize())
  handle('window:toggleMaximize', () => {
    const w = d.win()
    if (!w) return
    if (w.isMaximized()) w.unmaximize()
    else w.maximize()
  })
  handle('window:close', () => d.win()?.close())
}
