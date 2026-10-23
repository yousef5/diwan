import { lstat, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { app, BrowserWindow, dialog, Menu, powerMonitor, screen, session } from 'electron'
import appIcon from '../../resources/icon.png?asset'
import trayIcon from '../../resources/tray.png?asset'
import { SHELL_COMMAND, STATE_CHANGED } from '../shared/ipc'
import type { ShellCommand } from '../shared/types'
import { unreadTotal, windowTitle } from '../shared/unread'
import { AvatarFiles } from './avatars'
import { sweepStaleDownloadParts } from './downloads'
import { applyGuestPreferences, isAllowedGuest, partitionOf } from './guest-config'
import { resetCrashes, wireGuest } from './guests'
import { applyImport, fsPlanDeps, nexusRunning, sweepPartials } from './importer/apply'
import { importSupported, linuxOnly } from './importer/gate'
import { hasImportable, planForApply, planImport } from './importer/plan'
import { forgetAvatar, registerGuestIpc } from './ipc-guest'
import { registerShellIpc } from './ipc-shell'
import { classifyLink } from './link-policy'
import { createLogger } from './log'
import { Notifier } from './notifier'
import { sweepRemovedAccountFolders } from './orphan-partitions'
import { resolvePaths } from './paths'
import { Registry } from './registry'
import { rmRetryOptions } from './retry-fs'
import { wireSessionEnd } from './session-end'
import { accountForSession, setupGuestSession } from './sessions'
import { matchShortcut, type ShortcutAction } from './shortcuts'
import { StateHub } from './state'
import { Store } from './store/store'
import { TrayController } from './tray'
import { visibleBounds } from './window-bounds'
import { windowChrome } from './window-chrome'

// Tests and side-by-side runs use a throwaway profile.
if (process.env.DIWAN_USER_DATA) app.setPath('userData', process.env.DIWAN_USER_DATA)
// Windows groups taskbar buttons and attributes notifications by this id; it must match the installer's appId.
if (process.platform === 'win32') app.setAppUserModelId('com.yousef5.diwan')

if (!app.requestSingleInstanceLock()) app.quit()
else start()

function start(): void {
  const dev = !app.isPackaged
  const paths = resolvePaths()
  const log = createLogger(paths.logs, { echo: !app.isPackaged })
  const store = new Store(paths.userData, 300, (e) => log.error('saving settings failed (will retry)', e))
  if (store.recovery) log.error('settings file is damaged; running in recovery mode')
  const hub = new StateHub(store, (e) => log.error('a state listener failed', e))
  hub.dataDir = paths.userData
  const nexusPartitions = join(paths.nexusUserData, 'Partitions')
  const importedSources = () =>
    new Set(hub.accounts().flatMap((a) => (a.importedFrom ? [a.importedFrom] : [])))
  // Offered only when Nexus has an account that can actually be imported (installed is not enough:
  // it may have no signed-in accounts, or only ones already in Diwan).
  hub.importAvailable =
    importSupported(hub.platform) &&
    !store.get().importedFromNexus &&
    hasImportable({ nexusConfig: paths.nexusConfig, nexusPartitions }, fsPlanDeps, importedSources())
  hub.notify()
  const registry = new Registry()
  const avatars = new AvatarFiles(paths.avatars)
  // A crash during an import leaves acc-<id>.partial folders that no account uses.
  void sweepPartials(paths.partitions).catch((e) => log.warn('could not sweep partial imports', e))
  sweepStaleDownloadParts(paths.downloads) // synchronous; handles its own errors
  // A removed account's folder can come back as an empty shell (Electron keeps its session in memory
  // until quit). Only tombstoned ids are swept, only from a trusted account list, and before any
  // guest session exists. The sweep never rejects.
  const folderSweep = sweepRemovedAccountFolders(paths.partitions, hub).then(
    (removed) => {
      if (removed.length) log.info('removed leftover account folders', { count: removed.length })
    },
    (e) => log.warn('could not sweep leftover account folders', e),
  )
  let win: BrowserWindow | null = null
  let quitting = false
  // Saves the window geometry now; set by createWindow.
  let persistGeometry: () => void = () => {}

  // Any queued snapshot goes first: a command (say, logout's remount) must never reach the shell
  // before the state it follows from.
  // Never call this from inside a hub 'changed' listener: flush() is a no-op while a push is being
  // delivered (see StateHub), so the command would reach the shell before the snapshot carrying
  // the listener's own change. Defer it with queueMicrotask there.
  const sendShell = (cmd: ShellCommand) => {
    hub.flush()
    win?.webContents.send(SHELL_COMMAND, cmd)
  }
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
    // The shell never let go of the webview: close it ourselves before its storage is wiped.
    const lingering = registry.guestOf(id)
    if (lingering) {
      log.warn('guest still attached after removal, closing it', { id })
      lingering.close()
      await new Promise((r) => setImmediate(r))
    }
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
    await rm(dir, { recursive: true, force: true, ...rmRetryOptions() }).catch((e) =>
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
      ...windowChrome(hub.platform),
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
    // maximize() maps the window, so a hidden start must wait for the first real show.
    let pendingMax = saved.maximized
    w.on('show', () => {
      if (pendingMax) {
        pendingMax = false
        w.maximize()
      }
    })

    w.once('ready-to-show', () => {
      if (!hub.settings().startHidden || !hub.trayAvailable) w.show()
    })
    w.on('page-title-updated', (e) => e.preventDefault())
    w.on('focus', () => w.flashFrame(false))

    let geometryTimer: ReturnType<typeof setTimeout> | undefined
    const geometryNow = () => {
      clearTimeout(geometryTimer)
      if (w.isDestroyed()) return
      try {
        hub.persistWindow({ bounds: w.getNormalBounds(), maximized: w.isMaximized() || pendingMax })
      } catch (e) {
        log.warn('could not save the window geometry', e)
      }
    }
    persistGeometry = geometryNow
    const saveGeometry = () => {
      clearTimeout(geometryTimer)
      geometryTimer = setTimeout(geometryNow, 500)
    }
    w.on('resize', saveGeometry)
    w.on('move', saveGeometry)
    w.on('close', (e) => {
      if (!quitting && hub.settings().closeToTray && hub.trayAvailable) {
        e.preventDefault()
        w.hide()
        return
      }
      geometryNow()
    })
    w.on('closed', () => {
      win = null
    })

    const shellWc = w.webContents
    shellWc.setWindowOpenHandler(() => ({ action: 'deny' }))
    shellWc.on('will-navigate', (e) => e.preventDefault())
    // A crashed shell is a blank window: reload it, but at most 3 times a minute.
    let shellCrashes: number[] = []
    shellWc.on('render-process-gone', (_e, details) => {
      log.error('shell renderer gone', { reason: details.reason })
      if (details.reason === 'clean-exit' || w.isDestroyed()) return
      const now = performance.now() // monotonic: interval math, not a timestamp
      shellCrashes = shellCrashes.filter((t) => now - t <= 60_000)
      if (shellCrashes.length >= 3) {
        log.error('shell crashed 3 times in 60 s, not reloading it again')
        return
      }
      shellCrashes.push(now)
      shellWc.reload()
    })
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
      // A well-formed partition is not enough: it must belong to an account that exists now,
      // or a stray webview would recreate the folder of a removed account.
      const accountId = params.partition.slice('persist:acc-'.length)
      if (!hub.account(accountId)) {
        log.warn('refused a webview for an unknown account')
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
      const id = accountForSession(guest.session, hub.accounts())
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
    persistGeometry()
    flushQuietly()
  })
  // A second chance if before-quit's flush threw. app.exit() skips both events, so flush before calling it.
  app.on('will-quit', flushQuietly)
  app.on('window-all-closed', () => app.quit())

  app
    .whenReady()
    .then(async () => {
      await folderSweep
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
      // Logoff/shutdown: the close-to-tray handler must not cancel the close, and settings are saved now.
      wireSessionEnd({
        platform: process.platform,
        win,
        powerMonitor,
        onEnd: () => {
          quitting = true
          persistGeometry()
          flushQuietly()
        },
      })

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
        planImport: linuxOnly(hub.platform, () => {
          const plan = planImport(
            { nexusConfig: paths.nexusConfig, nexusPartitions },
            fsPlanDeps,
            importedSources(),
          )
          // Everything is already in (e.g. a crash just before markImported): stop offering the import.
          if (plan.reason === 'Already imported' && hub.importAvailable) hub.markImported()
          return { ...plan, nexusRunning: nexusRunning(paths.nexusUserData) }
        }),
        applyImport: linuxOnly(hub.platform, async () => {
          if (nexusRunning(paths.nexusUserData)) throw new Error('Quit Nexus first, then import again.')
          const plan = planForApply(
            planImport({ nexusConfig: paths.nexusConfig, nexusPartitions }, fsPlanDeps, importedSources()),
          )
          return applyImport(plan, {
            hub,
            partitionsDir: paths.partitions,
            setupSession,
            log,
            isNexusRunning: () => nexusRunning(paths.nexusUserData),
          })
        }),
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
    // A half-started app with no window would keep the single-instance lock forever: fail visibly.
    .catch((e) => {
      log.error('startup failed', e)
      flushQuietly() // app.exit() fires neither before-quit nor will-quit; the dialog below may be killed
      dialog.showErrorBox('Diwan could not start', 'Details are in the log in Diwan’s data folder.')
      app.exit(1)
    })
}
