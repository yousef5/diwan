import { randomUUID } from 'node:crypto'
import { type BrowserWindow, dialog, type IpcMainInvokeEvent, ipcMain, session, shell } from 'electron'
import type { z } from 'zod'
import { type ShellChannel, shellChannels } from '../shared/ipc'
import type { ImportPlan, ImportResult, ShellCommand } from '../shared/types'
import type { AvatarFiles } from './avatars'
import { partitionOf } from './guest-config'
import { resetCrashes } from './guests'
import { guardShell } from './ipc-guard'
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
  forgetNotifications(id: string): void
  sendShell(cmd: ShellCommand): void
  planImport(): ImportPlan
  applyImport(): Promise<ImportResult>
}

const LOGOUT_DETACH_TIMEOUT_MS = 5000

async function waitForDetach(registry: Registry, id: string): Promise<void> {
  const deadline = Date.now() + LOGOUT_DETACH_TIMEOUT_MS
  while (registry.guestOf(id) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50))
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
  handle('account:logout', async ({ id }) => {
    if (!d.hub.account(id)) return
    if (d.hub.runtimeOf(id).state === 'loggingOut') return
    // The shell stops rendering the webview for this state; wait until it is really gone so
    // the partition is not in use while its storage is wiped.
    d.hub.setRuntime(id, { state: 'loggingOut' })
    await waitForDetach(d.registry, id)
    const ses = session.fromPartition(partitionOf(id))
    await ses.clearStorageData()
    await ses.clearCache()
    d.avatars.remove(id)
    d.forgetNotifications(id)
    if (!d.hub.account(id)) return // removed while we were waiting
    d.hub.updateAccount(id, { customAvatar: false })
    d.hub.setRuntime(id, { avatar: null, unread: 0, state: 'loading' })
    d.sendShell({ type: 'remount', id })
  })
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

  handle('window:minimize', () => d.win()?.minimize())
  handle('window:toggleMaximize', () => {
    const w = d.win()
    if (!w) return
    if (w.isMaximized()) w.unmaximize()
    else w.maximize()
  })
  handle('window:close', () => d.win()?.close())
}
