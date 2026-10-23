import { randomUUID } from 'node:crypto'
import { type BrowserWindow, dialog, type IpcMainInvokeEvent, ipcMain, session, shell } from 'electron'
import type { z } from 'zod'
import { type ShellChannel, shellChannels } from '../shared/ipc'
import type { ImportPlan, ImportResult, ShellCommand } from '../shared/types'
import type { AvatarFiles } from './avatars'
import { forgetAvatar } from './guest-avatar'
import { partitionOf } from './guest-config'
import { resetCrashes } from './guests'
import { guardShell } from './ipc-guard'
import type { Logger } from './log'
import { logoutAccount } from './logout'
import type { Paths } from './paths'
import type { Registry } from './registry'
import type { StateHub } from './state'
import type { TaskbarBadge } from './taskbar-badge'
import type { TrayController } from './tray'

export interface ShellIpcDeps {
  hub: StateHub
  registry: Registry
  avatars: AvatarFiles
  tray: TrayController
  taskbar: Pick<TaskbarBadge<unknown>, 'setImages'>
  paths: Paths
  log: Logger
  win(): BrowserWindow | null
  setupSession(id: string): void
  setZoom(id: string, delta: 1 | -1 | 0): void
  removeAccount(id: string): Promise<void>
  forgetNotifications(id: string): void
  sendShell(cmd: ShellCommand): void
  planImport(): ImportPlan
  applyImport(): Promise<ImportResult>
  // Turns the whatsapp: handler on or off (Windows; a no-op elsewhere) and updates the snapshot.
  setWhatsappHandler(enabled: boolean): void
}

export function registerShellIpc(d: ShellIpcDeps): void {
  const wrap = guardShell<IpcMainInvokeEvent>({
    winWebContentsId: () => d.win()?.webContents.id,
    isMainFrame: (e) => e.senderFrame === e.sender.mainFrame,
    log: d.log,
  })
  function handle<C extends ShellChannel>(
    channel: C,
    fn: (payload: z.output<(typeof shellChannels)[C]>) => unknown,
  ): void {
    ipcMain.handle(channel, wrap(channel, shellChannels[channel] as z.ZodType, fn as (p: unknown) => unknown))
  }
  let dialogOpen = false

  handle('state:get', () => d.hub.snapshot())

  handle('account:add', ({ name, color }) => {
    if (d.hub.store.recovery) throw new Error('Cannot add accounts while the data file is in recovery mode')
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
  handle('account:logout', ({ id }) =>
    logoutAccount(id, {
      hasAccount: (x) => !!d.hub.account(x),
      runtimeOf: (x) => d.hub.runtimeOf(x),
      setRuntime: (x, p) => d.hub.setRuntime(x, p),
      clearCustomAvatar: (x) => d.hub.updateAccount(x, { customAvatar: false }),
      hasGuest: (x) => !!d.registry.guestOf(x),
      clearSession: async (x) => {
        const ses = session.fromPartition(partitionOf(x))
        await ses.clearStorageData()
        await ses.clearCache()
      },
      removeAvatar: (x) => d.avatars.remove(x),
      forgetNotifications: (x) => d.forgetNotifications(x),
      forgetAvatar,
      sendShell: (c) => d.sendShell(c),
      log: d.log,
    }),
  )
  handle('account:pickAvatar', async ({ id }) => {
    const w = d.win()
    if (!w || !d.hub.account(id) || dialogOpen) return
    dialogOpen = true
    try {
      const r = await dialog.showOpenDialog(w, {
        title: 'Choose a picture',
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }],
        properties: ['openFile'],
      })
      const file = r.filePaths[0]
      if (r.canceled || !file || !d.hub.account(id)) return
      const url = d.avatars.saveFromFile(id, file) // size + header-dimension checked before decoding
      if (!url) return
      d.hub.updateAccount(id, { customAvatar: true })
      d.hub.setRuntime(id, { avatar: url })
    } finally {
      dialogOpen = false
    }
  })
  handle('account:clearAvatar', ({ id }) => {
    if (!d.hub.account(id)) return
    d.avatars.remove(id)
    forgetAvatar(id)
    d.hub.updateAccount(id, { customAvatar: false })
    d.hub.setRuntime(id, { avatar: null })
  })

  handle('settings:update', (patch) => d.hub.updateSettings(patch))

  handle('importer:plan', () => d.planImport())
  handle('importer:apply', () => d.applyImport())

  handle('app:openDataFolder', async () => {
    const err = await shell.openPath(d.paths.userData)
    if (err) d.log.warn('openPath failed', { err })
  })
  handle('app:startFresh', () => {
    try {
      d.hub.store.startFresh()
    } finally {
      d.hub.notify()
    }
  })

  handle('tray:setBadges', (images) => d.tray.setBadges(images))
  handle('taskbar:setBadges', (images) => d.taskbar.setImages(images))
  handle('protocol:setWhatsapp', ({ enabled }) => d.setWhatsappHandler(enabled))

  handle('window:minimize', () => d.win()?.minimize())
  handle('window:toggleMaximize', () => {
    const w = d.win()
    if (!w) return
    if (w.isMaximized()) w.unmaximize()
    else w.maximize()
  })
  handle('window:close', () => d.win()?.close())
}
