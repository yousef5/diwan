import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react'
import type { Account, SettingsPatch, Snapshot } from '../../shared/types'
import { call } from '../api'
import { START_FRESH } from '../components/RecoveryBanner'
import { activeTile, focusFirst, mainRegion, trapTab } from '../focus'
import { initials } from '../format'
import { Icon } from '../icons'
import { type SettingsSection, useUi } from '../state'
import { Button } from '../ui/Button'
import { Kbd } from '../ui/Kbd'
import { Switch } from '../ui/Switch'
import { useEscape } from '../ui/useEscape'
import { Group, GroupTitle, Row, ToggleRow } from './Row'

export const SECTIONS: { id: SettingsSection; name: string }[] = [
  { id: 'general', name: 'General' },
  { id: 'notifications', name: 'Notifications' },
  { id: 'accounts', name: 'Accounts' },
  { id: 'data', name: 'Data' },
  { id: 'shortcuts', name: 'Shortcuts' },
  { id: 'about', name: 'About' },
]

export interface Shortcut {
  what: string
  // Alternatives: each one is a single key chip.
  keys: string[]
}

// What src/main/shortcuts.ts matches (by physical key, so any layout), plus the rail's own keys
// (Rail.tsx) and Esc (useEscape).
export function windowShortcuts(trayAvailable: boolean): Shortcut[] {
  return [
    { what: 'Go to account 1 … 9', keys: ['Ctrl 1 … 9'] },
    { what: 'Next account', keys: ['Ctrl Tab', 'Ctrl PgDn'] },
    { what: 'Previous account', keys: ['Ctrl Shift Tab', 'Ctrl PgUp'] },
    { what: 'Reload the account', keys: ['Ctrl R', 'F5'] },
    { what: 'Restart the account’s page', keys: ['Ctrl Shift R', 'Shift F5'] },
    { what: 'Zoom in (per account)', keys: ['Ctrl +'] },
    { what: 'Zoom out', keys: ['Ctrl −'] },
    { what: 'Reset zoom', keys: ['Ctrl 0'] },
    { what: 'Settings', keys: ['Ctrl ,'] },
    { what: trayAvailable ? 'Hide to tray' : 'Minimize the window', keys: ['Ctrl W'] },
    { what: 'Quit Diwan', keys: ['Ctrl Q'] },
    { what: 'Close Settings, a dialog or a menu', keys: ['Esc'] },
  ]
}

export const RAIL_SHORTCUTS: Shortcut[] = [
  { what: 'Move the focused account up or down', keys: ['Alt ↑', 'Alt ↓'] },
  { what: 'Open the focused account’s menu', keys: ['Shift F10', 'Menu'] },
]

const layerOnTop = () => {
  const s = useUi.getState()
  return s.dialog !== null || s.menu !== null
}

const currentNav = (list: HTMLElement | null) => list?.querySelector<HTMLElement>('[aria-current="page"]')

// Every change goes to main; what the page shows comes back in the next snapshot, so a switch
// always shows what main has. A failed call is an error toast (`call`). In recovery mode main
// ignores the write silently (the store is read-only), which is why the switches are
// disabled then.
const save = (patch: SettingsPatch) => void call('settings:update', patch)
const setMuted = (id: string, muted: boolean) => void call('account:update', { id, patch: { muted } })

// The settings page (docs/design/settings.dc.html). It covers the window below the window-controls
// bar (when that is shown), stage included, but never replaces it: every WhatsApp page stays
// mounted underneath. A modal dialog: focus moves to the current section on open and back to
// whatever had it on close, Tab stays inside, and Esc closes it unless a dialog or menu is open on
// top (that layer takes the Esc first).
export function SettingsPage() {
  const open = useUi((s) => s.settingsOpen)
  const ready = useUi((s) => s.snap !== null)
  return open && ready ? <SettingsPanel /> : null
}

function SettingsPanel() {
  const snap = useUi((s) => s.snap) as Snapshot
  const section = useUi((s) => s.section)
  const covered = useUi((s) => s.dialog !== null || s.menu !== null)
  // The window-controls bar (32 px, App) stays above the page, so the window can still be moved,
  // minimised and closed with Settings open.
  const controls = snap.settings.showWindowControls
  const openSettings = useUi((s) => s.openSettings)
  const closeSettings = useUi((s) => s.closeSettings)
  useEscape(closeSettings, !covered)

  const panel = useRef<HTMLDivElement>(null)
  const nav = useRef<HTMLUListElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const titleId = useId()
  // Read during the first render: what had focus before Settings opened.
  const [returnTo] = useState(() => document.activeElement)
  // The last control focused inside the page, for when a dialog or menu on top hands focus away.
  const lastInside = useRef<HTMLElement | null>(null)

  // Opened under a dialog or menu (Ctrl+, works then): leave focus in that layer; the effect below
  // moves it in here once nothing is on top. Likewise, closing never pulls focus out from under one.
  useEffect(() => {
    if (!layerOnTop()) focusFirst([() => currentNav(nav.current), () => panel.current])
    return () => {
      if (layerOnTop()) return
      focusFirst([() => (returnTo === document.body ? null : returnTo), activeTile, mainRegion])
    }
  }, [returnTo])

  // A dialog opened from here returns focus to its own opener, which may be gone (a menu item) or
  // sit under this page (a rail tile). Once nothing is on top, focus belongs in here.
  useEffect(() => {
    if (covered) return
    const root = panel.current
    if (!root || root.contains(document.activeElement)) return
    focusFirst([() => lastInside.current, () => currentNav(nav.current), () => root])
  }, [covered])

  // ↑/↓, Home and End move between sections in the nav; Enter or Space opens one.
  const onNavKey = (e: KeyboardEvent<HTMLUListElement>) => {
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button'))
    const at = items.indexOf(document.activeElement as HTMLElement)
    let to = -1
    if (e.key === 'ArrowDown') to = (at + 1) % items.length
    else if (e.key === 'ArrowUp') to = (at - 1 + items.length) % items.length
    else if (e.key === 'Home') to = 0
    else if (e.key === 'End') to = items.length - 1
    if (to < 0 || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
    e.preventDefault()
    items[to].focus()
  }

  return (
    <div
      ref={panel}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      onKeyDown={(e) => panel.current && trapTab(e, panel.current)}
      onFocus={(e) => {
        if (e.target instanceof HTMLElement && e.target !== panel.current) lastInside.current = e.target
      }}
      className={`no-drag fixed inset-x-0 bottom-0 z-40 flex bg-bg-0 outline-none ${controls ? 'top-8' : 'top-0'}`}
    >
      <nav
        aria-label="Settings sections"
        className="flex w-[236px] shrink-0 flex-col border-r border-line bg-bg-1 px-3 py-[22px]"
      >
        {/* The title row drags the frameless window, as the rail and context bar do under it. */}
        <h1 id={titleId} className="drag mx-2.5 mt-0 mb-3.5 text-[18px] font-semibold text-fg-strong">
          Settings
        </h1>
        <ul ref={nav} onKeyDown={onNavKey} className="m-0 flex list-none flex-col gap-0.5 p-0">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                aria-current={s.id === section ? 'page' : undefined}
                onClick={() => {
                  if (s.id !== section && content.current) content.current.scrollTop = 0
                  openSettings(s.id)
                }}
                className={`w-full rounded-lg px-2.5 py-[9px] text-left text-[13px] font-medium ${
                  s.id === section ? 'bg-bg-active text-fg-strong' : 'text-fg-dim hover:bg-bg-3 hover:text-fg'
                }`}
              >
                {s.name}
              </button>
            </li>
          ))}
        </ul>
        <div className="flex-1" />
        <p className="mx-2.5 my-0 font-mono text-[11px] text-fg-mute">Diwan {__APP_VERSION__}</p>
      </nav>

      <div ref={content} className="relative min-w-0 flex-1 overflow-auto">
        <button
          type="button"
          aria-label="Close settings"
          aria-keyshortcuts="Escape"
          onClick={closeSettings}
          className="absolute top-[18px] right-5 flex h-8 items-center gap-2 rounded-lg border border-line-strong px-2.5 text-[12px] font-medium text-fg-dim hover:bg-bg-3 hover:text-fg"
        >
          Close <Kbd>Esc</Kbd>
        </button>
        <div className="flex max-w-[720px] flex-col gap-7 px-12 pt-[30px] pb-12">
          {section === 'general' && <General snap={snap} />}
          {section === 'notifications' && <Notifications snap={snap} />}
          {section === 'accounts' && <Accounts snap={snap} />}
          {section === 'data' && <Data snap={snap} />}
          {section === 'shortcuts' && <Shortcuts snap={snap} />}
          {section === 'about' && <About />}
        </div>
      </div>
    </div>
  )
}

function Header({ title, body, recovery }: { title: string; body?: ReactNode; recovery?: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="mt-0 mb-1.5 text-[22px] font-semibold text-fg-strong">{title}</h2>
        {body && <p className="m-0 text-[13px] leading-normal text-fg-dim">{body}</p>}
      </div>
      {recovery && (
        <p className="m-0 flex items-start gap-2.5 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2.5 text-[13px] leading-normal text-fg">
          <Icon name="alert" size={16} className="mt-px shrink-0 text-warn" />
          <span>
            Diwan’s settings file is damaged, so changes can’t be saved right now. Start fresh under Data to
            fix it.
          </span>
        </p>
      )}
    </div>
  )
}

function General({ snap }: { snap: Snapshot }) {
  const { settings, trayAvailable, recovery } = snap
  const noTray = 'There is no system tray on this desktop, so Diwan can’t hide there.'
  return (
    <>
      <Header title="General" recovery={recovery} />
      <Group label="Window">
        <ToggleRow
          title="Close to tray"
          hint={
            trayAvailable ? 'Closing the window keeps Diwan running, so notifications still arrive.' : noTray
          }
          checked={settings.closeToTray}
          disabled={recovery || !trayAvailable}
          onChange={(v) => save({ closeToTray: v })}
        />
        <ToggleRow
          title="Start hidden"
          hint={trayAvailable ? 'Open straight to the tray when Diwan starts.' : noTray}
          checked={settings.startHidden}
          disabled={recovery || !trayAvailable}
          onChange={(v) => save({ startHidden: v })}
        />
        <ToggleRow
          title="Show window controls"
          hint="Adds minimize, maximize and close buttons. Tiling desktops like Hyprland don’t need them."
          checked={settings.showWindowControls}
          disabled={recovery}
          onChange={(v) => save({ showWindowControls: v })}
        />
      </Group>
    </>
  )
}

function Notifications({ snap }: { snap: Snapshot }) {
  const { settings, accounts, runtime, recovery } = snap
  const n = settings.notifications
  return (
    <>
      <Header
        title="Notifications"
        body="Diwan shows its own notifications, named after the account they come from. Clicking one opens that chat."
        recovery={recovery}
      />
      <Group label="All accounts">
        <ToggleRow
          title="Show notifications"
          hint="Turn off to silence every account at once (also in the tray menu)."
          checked={n.enabled}
          disabled={recovery}
          onChange={(v) => save({ notifications: { enabled: v } })}
        />
        <ToggleRow
          title="Play a sound"
          hint="Uses the system notification sound."
          checked={n.sound}
          disabled={recovery}
          onChange={(v) => save({ notifications: { sound: v } })}
        />
        <ToggleRow
          title="Show message text"
          hint="Off shows “New message” instead, for screen sharing and recording."
          checked={n.showPreview}
          disabled={recovery}
          onChange={(v) => save({ notifications: { showPreview: v } })}
        />
        <ToggleRow
          title="Mark the window as urgent"
          hint="Highlights Diwan’s workspace in the bar when a message arrives."
          checked={n.markUrgent}
          disabled={recovery}
          onChange={(v) => save({ notifications: { markUrgent: v } })}
        />
      </Group>
      {accounts.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <GroupTitle>Per account</GroupTitle>
          <Group label="Per-account notifications">
            {accounts.map((a) => (
              <AccountToggle
                key={a.id}
                account={a}
                avatar={runtime[a.id]?.avatar ?? null}
                disabled={recovery}
              />
            ))}
          </Group>
        </div>
      )}
    </>
  )
}

function AccountToggle({
  account,
  avatar,
  disabled,
}: {
  account: Account
  avatar: string | null
  disabled: boolean
}) {
  const id = useId()
  return (
    <label
      htmlFor={id}
      className={`flex items-center gap-3 px-[18px] py-3 ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
    >
      <AccountBadge name={account.name} color={account.color} avatar={avatar} />
      <span
        dir="auto"
        className="bidi-plain min-w-0 flex-1 truncate text-left text-[14px] font-medium text-fg-strong"
      >
        {account.name}
      </span>
      <span aria-hidden="true" className="mr-3 text-[12px] text-fg-dim">
        {account.muted ? 'Muted' : 'On'}
      </span>
      <Switch
        id={id}
        label={`Notifications for ${account.name}`}
        checked={!account.muted}
        disabled={disabled}
        onChange={(v) => setMuted(account.id, !v)}
      />
    </label>
  )
}

function Accounts({ snap }: { snap: Snapshot }) {
  const { accounts, runtime, recovery } = snap
  const openDialog = useUi((s) => s.openDialog)
  const openMenu = useUi((s) => s.openMenu)
  return (
    <>
      <Header
        title="Accounts"
        body="Drag tiles in the rail to reorder them, or focus one and press Alt ↑ / Alt ↓. Right-click a tile for more."
        recovery={recovery}
      />
      <Group label="Accounts">
        {accounts.map((a, i) => (
          <div key={a.id} className="flex items-center gap-3 px-[18px] py-3">
            <AccountBadge name={a.name} color={a.color} avatar={runtime[a.id]?.avatar ?? null} />
            <span
              dir="auto"
              className="bidi-plain min-w-0 flex-1 truncate text-left text-[14px] font-medium text-fg-strong"
            >
              {a.name}
            </span>
            {i < 9 && <Kbd>{`Ctrl ${i + 1}`}</Kbd>}
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Edit ${a.name}`}
              disabled={recovery}
              onClick={() => openDialog({ kind: 'edit', id: a.id })}
            >
              <Icon name="pencil" size={14} /> Edit
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`More actions for ${a.name}`}
              aria-haspopup="menu"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect()
                openMenu({ id: a.id, x: r.right - 228, y: r.bottom + 6 })
              }}
            >
              <Icon name="more" size={16} />
            </Button>
          </div>
        ))}
        {accounts.length === 0 && (
          <p className="m-0 px-[18px] py-4 text-[13px] text-fg-dim">No accounts yet.</p>
        )}
      </Group>
      <div>
        <Button variant="primary" disabled={recovery} onClick={() => openDialog({ kind: 'add' })}>
          <Icon name="plus" size={15} /> Add account
        </Button>
      </div>
    </>
  )
}

function Data({ snap }: { snap: Snapshot }) {
  const { recovery, importAvailable } = snap
  const openDialog = useUi((s) => s.openDialog)
  return (
    <>
      <Header title="Data" body="Everything stays on this computer, in ~/.config/Diwan." />
      <Group label="Data">
        {recovery && (
          <Row
            title="Settings file is damaged"
            hint="Diwan can’t read its settings, so nothing is saved. Starting fresh keeps the damaged file (renamed .broken); your WhatsApp logins stay on disk."
            control={(hintId) => (
              <Button variant="subtle" aria-describedby={hintId} onClick={() => openDialog(START_FRESH)}>
                Start fresh…
              </Button>
            )}
          />
        )}
        <Row
          title="Import from Nexus"
          hint={
            recovery
              ? 'Not while the settings file is damaged.'
              : importAvailable
                ? 'Moves your Nexus accounts across, already signed in.'
                : 'Nexus wasn’t found on this computer, or it has nothing left to import.'
          }
          control={(hintId) => (
            <Button
              variant="ghost"
              aria-label="Import from Nexus"
              aria-describedby={hintId}
              disabled={recovery}
              onClick={() => openDialog({ kind: 'import' })}
            >
              <Icon name="download" size={14} /> Import…
            </Button>
          )}
        />
        <Row
          title="Data folder"
          hint="Settings, logs and each account’s WhatsApp session."
          control={(hintId) => <OpenDataFolder describedBy={hintId} />}
        />
      </Group>
    </>
  )
}

function OpenDataFolder({ describedBy }: { describedBy?: string }) {
  return (
    <Button
      variant="ghost"
      aria-label="Open the data folder"
      aria-describedby={describedBy}
      onClick={() => void call('app:openDataFolder')}
    >
      <Icon name="folder" size={14} /> Open
    </Button>
  )
}

function ShortcutList({ label, list }: { label: string; list: Shortcut[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      <GroupTitle>{label}</GroupTitle>
      <dl
        aria-label={label}
        className="m-0 flex flex-col overflow-hidden rounded-xl border border-line bg-bg-2 [&>*+*]:border-t [&>*+*]:border-line-soft"
      >
        {list.map((s) => (
          <div key={s.what} className="flex items-center gap-4 px-[18px] py-3">
            <dt className="flex-1 text-[13px] text-fg">{s.what}</dt>
            <dd dir="ltr" className="m-0 flex items-center gap-1.5 text-[11px] text-fg-dim">
              {s.keys.map((k, i) => (
                <span key={k} className="flex items-center gap-1.5">
                  {i > 0 && <span>or</span>}
                  <Kbd>{k}</Kbd>
                </span>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function Shortcuts({ snap }: { snap: Snapshot }) {
  return (
    <>
      <Header title="Shortcuts" body="They work with the Arabic keyboard layout too." />
      <ShortcutList label="Anywhere in Diwan" list={windowShortcuts(snap.trayAvailable)} />
      <ShortcutList label="In the account rail" list={RAIL_SHORTCUTS} />
    </>
  )
}

function About() {
  return (
    <>
      <Header title="About" />
      <Group label="About">
        <Row
          title="Diwan"
          hint="Multi-account WhatsApp Web for Linux. No telemetry: the only network traffic is WhatsApp’s."
          control={() => (
            <span dir="ltr" className="font-mono text-[12px] text-fg-dim">
              Version {__APP_VERSION__}
            </span>
          )}
        />
        <Row
          title="Data and logs"
          hint="The logs are in the logs folder inside the data folder. They never contain message text."
          control={(hintId) => <OpenDataFolder describedBy={hintId} />}
        />
      </Group>
    </>
  )
}

function AccountBadge({ name, color, avatar }: { name: string; color: string; avatar: string | null }) {
  return (
    <span
      aria-hidden="true"
      style={{ background: color }}
      className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg text-[11px] font-semibold text-white"
    >
      {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : initials(name)}
    </span>
  )
}
