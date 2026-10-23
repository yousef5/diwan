import { useEffect } from 'react'
import { unreadTotal } from '../shared/unread'
import { call } from './api'
import { AccountMenu } from './components/AccountMenu'
import { Dialogs } from './components/Dialogs'
import { Rail } from './components/Rail'
import { RecoveryBanner } from './components/RecoveryBanner'
import { Stage } from './components/Stage'
import { WindowControls } from './components/WindowControls'
import { importOffered } from './platform'
import { SettingsPage } from './settings/SettingsPage'
import { useUi } from './state'
import { overlayBadges, trayBadges } from './trayBadges'
import { Toasts } from './ui/Toasts'

// The first snapshot. Pushes are subscribed to before asking, so none is lost in between; and a
// push that arrives while the request is out is newer than its reply, so then the reply is dropped.
export function useSnapshot(): void {
  useEffect(() => {
    const { setSnap } = useUi.getState()
    let live = true
    let pushed = false
    const off = window.diwan.onState((s) => {
      pushed = true
      setSnap(s)
    })
    // A failure is an error toast (call); pushes still arrive, and the next change brings the state.
    void call('state:get').then((s) => {
      if (live && !pushed && s) setSnap(s)
    })
    return () => {
      live = false
      off()
    }
  }, [])
}

// main → shell commands that nothing else handles. `remount` belongs to Stage
// (useRemountCommands), which owns the webviews.
export function useAppCommands(): void {
  useEffect(
    () =>
      window.diwan.onCommand((c) => {
        if (c.type === 'openSettings') useUi.getState().openSettings()
      }),
    [],
  )
}

// The tray badge (and on Windows the taskbar overlay) follows the unmuted unread total, through
// every snapshot (no re-render here).
function useTrayBadges(): void {
  useEffect(() => {
    let lastSnap: unknown = null
    const sync = () => {
      const snap = useUi.getState().snap
      if (!snap || snap === lastSnap) return
      lastSnap = snap
      const total = unreadTotal(snap.accounts, snap.runtime)
      if (snap.trayAvailable) void trayBadges().show(total)
      if (snap.platform === 'win32') void overlayBadges().show(total)
    }
    sync()
    return useUi.subscribe(sync)
  }, [])
}

// Offer the Nexus import once per launch, on a run that has no accounts yet (the first one). Linux only.
function useImportOffer(): void {
  useEffect(() => {
    let offered = false
    const check = () => {
      const s = useUi.getState()
      if (offered || !s.snap) return
      offered = true
      if (importOffered(s.snap) && s.snap.accounts.length === 0 && !s.dialog && !s.snap.recovery) {
        s.openDialog({ kind: 'import' })
      }
    }
    check()
    return useUi.subscribe(check)
  }, [])
}

// The shell. Every layer is always rendered and gates itself, so nothing is ever unmounted behind
// another: Settings (z-40) and dialogs (z-50) cover the stage, whose webviews stay alive.
export function App() {
  useSnapshot()
  useAppCommands()
  useTrayBadges()
  useImportOffer()
  return (
    <div className="flex h-full flex-col">
      <WindowControls />
      <RecoveryBanner />
      <div className="flex min-h-0 flex-1">
        <Rail />
        <Stage />
      </div>
      <SettingsPage />
      <AccountMenu />
      <Dialogs />
      <Toasts />
    </div>
  )
}
