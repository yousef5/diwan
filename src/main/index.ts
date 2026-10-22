import { existsSync } from 'node:fs'
import { lstat, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { app, BrowserWindow, Menu, screen, session } from 'electron'
import appIcon from '../../resources/icon.png?asset'
import trayIcon from '../../resources/tray.png?asset'
import { SHELL_COMMAND, STATE_CHANGED } from '../shared/ipc'
import type { Account, ShellCommand } from '../shared/types'
import { unreadTotal, windowTitle } from '../shared/unread'
import { AvatarFiles } from './avatars'
import { sweepStaleDownloadParts } from './downloads'
import { applyGuestPreferences, isAllowedGuest, partitionOf } from './guest-config'
import { resetCrashes, wireGuest } from './guests'
import { applyImport, fsPlanDeps, nexusRunning, sweepPartials } from './importer/apply'
import { planImport } from './importer/plan'
import { forgetAvatar, registerGuestIpc } from './ipc-guest'
import { registerShellIpc } from './ipc-shell'
import { classifyLink } from './link-policy'
import { createLogger } from './log'
import { Notifier } from './notifier'
import { resolvePaths } from './paths'
import { Registry } from './registry'
import { accountForSession, setupGuestSession } from './sessions'
import { matchShortcut, type ShortcutAction } from './shortcuts'
import { StateHub } from './state'
import { Store } from './store/store'
import { TrayController } from './tray'
import { visibleBounds } from './window-bounds'

// Tests and side-by-side runs use a throwaway profile.
if (process.env.DIWAN_USER_DATA) app.setPath('userData', process.env.DIWAN_USER_DATA)

if (!app.requestSingleInstanceLock()) app.quit()
else start()

function start(): void {
  const dev = !app.isPackaged
  const paths = resolvePaths()
  const log = createLogger(paths.logs, { echo: !app.isPackaged })
  const store = new Store(paths.userData, 300, (e) => log.error('saving settings failed (will retry)', e))
  if (store.recovery) log.error('settings file is damaged; running in recovery mode')
  const hub = new StateHub(store, (e) => log.error('a state listener failed', e))
  hub.importAvailable = !store.get().importedFromNexus && existsSync(paths.nexusConfig)
  hub.notify()
  const registry = new Registry()
  const avatars = new AvatarFiles(paths.avatars)
  const nexusPartitions = join(paths.nexusUserData, 'Partitions')
  const importedSources = () =>
    new Set(hub.accounts().flatMap((a) => (a.importedFrom ? [a.importedFrom] : [])))
  // A crash during an import leaves acc-<id>.partial folders that no account uses.
  void sweepPartials(paths.partitions).catch((e) => log.warn('could not sweep partial imports', e))
  sweepStaleDownloadParts(paths.downloads) // synchronous; handles its own errors
  let win: BrowserWindow | null = null
  let quitting = false

  const sendShell = (cmd: ShellCommand) => win?.webContents.send(SHELL_COMMAND, cmd)
  const showWindow = () => {
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }
  const reveal = (id: string) => {
    hub.setActive(id)
    showWindow()
  }
  const quit = () => {
    quitting = true
    app.quit()
  }
  const setupSession = (id: string) => {
    setupGuestSession(id, { downloads: paths.downloads, log })
  }

  const notifier = new Notifier({
    hub,
    registry,
    log,
    reveal,
    // "Looking at it" = focused, visible and not minimised; a hidden or minimised window always notifies.
    isWindowFocused: () => !!win && win.isFocused() && win.isVisible() && !win.isMinimized(),
    flash: () => win?.flashFrame(true),
  })
  const tray = new TrayController({ hub, icon: trayIcon, log, show: showWindow, reveal, quit })
  // Last resort: a stray error is logged instead of Electron's modal "JavaScript error" dialog.
  process.on('uncaughtException', (e) => log.error('uncaught exception', e))
  process.on('unhandledRejection', (e) => log.error('unhandled rejection', e))
  app.on('child-process-gone', (_e, details) => {
    if (details.reason !== 'clean-exit')
      log.error('child process gone', { type: details.type, reason: details.reason })
  })

  function setZoom(id: string, delta: 1 | -1 | 0): void {
    const current = hub.account(id)?.zoom ?? 0
    const next = delta === 0 ? 0 : Math.max(-5, Math.min(5, current + delta))
    hub.updateAccount(id, { zoom: next })
    registry.guestOf(id)?.setZoomLevel(next)
  }

  function onShortcut(a: ShortcutAction): void {
    const active = hub.active()
    switch (a.type) {
      case 'account': {
        const target = hub.accounts()[a.index]
        if (target) hub.setActive(target.id)
        return
      }
      case 'next':
        hub.cycle(1)
        return
      case 'prev':
        hub.cycle(-1)
        return
      case 'reload':
        if (active) registry.guestOf(active)?.reload()
        return
      case 'remount':
        if (active) {
          resetCrashes(active)
          sendShell({ type: 'remount', id: active })
        }
        return
      case 'zoom':
        if (active) setZoom(active, a.delta)
        return
      case 'settings':
        showWindow()
        sendShell({ type: 'openSettings' })
        return
      case 'hide':
        if (hub.trayAvailable) win?.hide()
        else win?.minimize()
        return
      case 'quit':
        quit()
        return
      case 'ignore':
        return
    }
  }

  // whatsapp:// links (from the .desktop scheme handler) open the chat in the visible account.
  function openChat(url: string, attempt = 0): void {
    const id = hub.active()
    const guest = id ? registry.guestOf(id) : undefined
    if (guest && !guest.isLoading()) {
      void guest.loadURL(url)
      return
    }
    if (attempt < 60) setTimeout(() => openChat(url, attempt + 1), 500)
  }

  function handleArgv(argv: string[]): void {
    const link = argv.find((a) => a.startsWith('whatsapp:'))
    if (!link) return
    const action = classifyLink(link)
    if (action.kind === 'chat') openChat(action.url)
  }

  async function removeAccount(id: string): Promise<void> {
    // Only a known account's folder is ever deleted (in recovery mode the store refuses the removal).
    if (!hub.account(id)) return
    hub.removeAccount(id) // the shell drops the webview on the next snapshot
    if (hub.account(id)) throw new Error('The account could not be removed while settings are read-only')
    notifier.forgetAccount(id)
    avatars.remove(id)
    forgetAvatar(id) // reset the guest-avatar dedupe for this account
    for (let i = 0; i < 50 && registry.guestOf(id); i++) await new Promise((r) => setTimeout(r, 100))
    const dir = join(paths.partitions, `acc-${id}`)
    // Never clear storage through a symlink: it could point into another app's live session.
    const isPlainDir = await lstat(dir).then(
      (st) => st.isDirectory(),
      () => false,
    )
    if (isPlainDir) {
      const ses = session.fromPartition(partitionOf(id))
      await ses.clearStorageData().catch(() => {})
      await ses.clearCache().catch(() => {})
    }
    await rm(dir, { recursive: true, force: true }).catch((e) =>
      log.warn('could not delete the account folder', e),
    )
    log.info('account removed', { id })
  }

  function createWindow(): BrowserWindow {
    const saved = hub.settings().window
    const bounds = visibleBounds(
      saved.bounds,
      screen.getAllDisplays().map((d) => d.workArea),
      { width: 1280, height: 820 },
    )
    const w = new BrowserWindow({
      ...bounds,
      minWidth: 760,
      minHeight: 520,
      show: false,
      frame: false,
      backgroundColor: '#0f0f11',
      title: 'Diwan',
      icon: appIcon,
      webPreferences: {
        preload: join(__dirname, '../preload/shell.js'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webviewTag: true,
        spellcheck: false,
      },
    })
    if (saved.maximized) w.maximize()

    w.once('ready-to-show', () => {
      if (!hub.settings().startHidden || !hub.trayAvailable) w.show()
    })
    w.on('page-title-updated', (e) => e.preventDefault())
    w.on('focus', () => w.flashFrame(false))

    let geometryTimer: ReturnType<typeof setTimeout> | undefined
    const saveGeometry = () => {
      clearTimeout(geometryTimer)
      geometryTimer = setTimeout(() => {
        if (!w.isDestroyed()) hub.persistWindow({ bounds: w.getNormalBounds(), maximized: w.isMaximized() })
      }, 500)
    }
    w.on('resize', saveGeometry)
    w.on('move', saveGeometry)
    w.on('close', (e) => {
      if (!quitting && hub.settings().closeToTray && hub.trayAvailable) {
        e.preventDefault()
        w.hide()
      }
    })
    w.on('closed', () => {
      win = null
    })

    const shellWc = w.webContents
    shellWc.setWindowOpenHandler(() => ({ action: 'deny' }))
    shellWc.on('will-navigate', (e) => e.preventDefault())
    shellWc.on('render-process-gone', (_e, details) =>
      log.error('shell renderer gone', { reason: details.reason }),
    )
    shellWc.on('before-input-event', (event, input) => {
      const action = matchShortcut(input)
      if (!action) return
      event.preventDefault()
      onShortcut(action)
    })
    shellWc.on('will-attach-webview', (event, prefs, params) => {
      if (!isAllowedGuest(params, prefs as unknown as Record<string, unknown>)) {
        log.warn('refused a webview', { src: params.src })
        event.preventDefault()
        return
      }
      applyGuestPreferences(
        prefs as unknown as Record<string, unknown>,
        join(__dirname, '../preload/guest.js'),
        params.partition,
      )
    })
    shellWc.on('did-attach-webview', (_e, guest) => {
      const id = accountForSession(guest.session, hub.accounts() as Account[])
      if (!id || !hub.account(id)) {
        log.warn('webview for an unknown account')
        guest.close()
        return
      }
      wireGuest(guest, id, {
        hub,
        registry,
        log,
        dev,
        sendShell,
        onShortcut,
        onDestroyed: (acc) => {
          // a remount's old guest dies after the new one attached: keep the new page's notifications
          if (!registry.guestOf(acc)) notifier.forgetAccount(acc)
        },
      })
    })

    // Only a dev build may load the shell from a URL; a packaged app always loads its own files.
    if (dev && process.env.ELECTRON_RENDERER_URL) void w.loadURL(process.env.ELECTRON_RENDERER_URL)
    else void w.loadFile(join(__dirname, '../renderer/index.html'))
    return w
  }

  app.on('second-instance', (_e, argv) => {
    showWindow()
    handleArgv(argv)
  })
  const flushQuietly = () => {
    try {
      store.flush()
    } catch (e) {
      log.error('could not save settings on quit', e)
    }
  }
  app.on('before-quit', () => {
    quitting = true
    flushQuietly()
  })
  app.on('will-quit', flushQuietly) // app.exit() skips before-quit
  app.on('window-all-closed', () => app.quit())

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null)
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
    for (const a of hub.accounts()) {
      setupSession(a.id)
      const avatar = avatars.load(a.id)
      if (avatar) hub.setRuntime(a.id, { avatar })
    }
    hub.trayAvailable = tray.start()
    hub.notify()
    win = createWindow()

    registerShellIpc({
      hub,
      registry,
      avatars,
      tray,
      paths,
      log,
      win: () => win,
      setupSession,
      setZoom,
      removeAccount,
      forgetNotifications: (id) => notifier.forgetAccount(id),
      sendShell,
      planImport: () => {
        const plan = planImport(
          { nexusConfig: paths.nexusConfig, nexusPartitions },
          fsPlanDeps,
          importedSources(),
        )
        // Everything is already in (e.g. a crash just before markImported): stop offering the import.
        if (plan.reason === 'Already imported' && hub.importAvailable) hub.markImported()
        return { ...plan, nexusRunning: nexusRunning(paths.nexusUserData) }
      },
      applyImport: async () => {
        if (nexusRunning(paths.nexusUserData)) throw new Error('Quit Nexus first, then import again.')
        const plan = planImport(
          { nexusConfig: paths.nexusConfig, nexusPartitions },
          fsPlanDeps,
          importedSources(),
        )
        return applyImport(plan, {
          hub,
          partitionsDir: paths.partitions,
          setupSession,
          log,
          isNexusRunning: () => nexusRunning(paths.nexusUserData),
        })
      },
    })
    registerGuestIpc({ hub, registry, notifier, avatars, log })

    hub.on('changed', (s) => {
      win?.webContents.send(STATE_CHANGED, s)
      tray.update(s)
      win?.setTitle(windowTitle(unreadTotal(s.accounts, s.runtime)))
    })
    handleArgv(process.argv)
    log.info('Diwan started', { version: app.getVersion(), accounts: hub.accounts().length })
  })
}
