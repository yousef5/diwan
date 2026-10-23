import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import type { ImportPlan, ImportResult } from '../../shared/types'
import { attempt } from '../api'
import { formatBytes, initials } from '../format'
import { Icon } from '../icons'
import { useUi } from '../state'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'

// Main's reasons for "nothing to import" (src/main/importer/plan.ts), said for this dialog.
const REASONS: Record<string, string> = {
  'Nexus is not installed on this computer':
    'Nexus isn’t installed on this computer, so there is nothing to import.',
  'Nexus settings file is damaged':
    'Nexus’s settings file is damaged, so Diwan can’t tell which accounts it has.',
  'Nexus has no signed-in accounts': 'Nexus has no signed-in accounts to import.',
  'Already imported': 'Every Nexus account is already in Diwan.',
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

type Phase =
  | { at: 'loading' }
  | { at: 'loadFailed'; error: string }
  | { at: 'plan'; plan: ImportPlan }
  | { at: 'applying'; plan: ImportPlan }
  | { at: 'done'; result: ImportResult }

function Notice({ tone, children }: { tone: 'warn' | 'error'; children: ReactNode }) {
  return (
    <div
      role="alert"
      className={`mt-3 flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[13px] text-fg ${
        tone === 'warn' ? 'border-warn/40 bg-warn/10' : 'border-danger/45 bg-danger/10'
      }`}
    >
      <Icon
        name="alert"
        size={15}
        className={`mt-0.5 shrink-0 ${tone === 'warn' ? 'text-warn' : 'text-danger'}`}
      />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

// Import accounts from Nexus (the old MultiWhatsApp app). Shows main's plan: what will be copied
// and how big it is, what is already in Diwan, and whether Nexus must be quit first. While main
// copies, the dialog can't be dismissed; afterwards it says exactly what was and wasn't imported.
// A failure from main is shown as main worded it, never as success.
export function ImportDialog() {
  const recovery = useUi((s) => s.snap?.recovery === true)
  // Accounts imported earlier (main leaves them out of the plan).
  const accounts = useUi((s) => s.snap?.accounts)
  const earlier = accounts?.filter((a) => a.importedFrom !== undefined) ?? []
  const [phase, setPhase] = useState<Phase>({ at: 'loading' })
  const [applyError, setApplyError] = useState<string | null>(null)
  const busy = phase.at === 'applying'
  const busyRef = useRef(false)
  const body = useRef<HTMLDivElement>(null)
  busyRef.current = busy
  const close = useCallback(() => {
    if (!busyRef.current) useUi.getState().openDialog(null)
  }, [])

  const load = useCallback(async () => {
    const r = await attempt('importer:plan')
    setPhase(r.ok ? { at: 'plan', plan: r.value } : { at: 'loadFailed', error: r.error })
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  // A phase change can unmount or disable the focused button (Import → Done): keep focus inside.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on purpose after every phase change
  useEffect(() => {
    const root = body.current?.closest<HTMLElement>('[role="dialog"]')
    if (!root || root.contains(document.activeElement)) return
    const next =
      root.querySelector<HTMLElement>('[data-autofocus]') ??
      root.querySelector<HTMLElement>('button:not([disabled])')
    ;(next ?? root).focus()
  }, [phase, applyError])

  const apply = async (plan: ImportPlan) => {
    setApplyError(null)
    setPhase({ at: 'applying', plan })
    const r = await attempt('importer:apply')
    if (r.ok) {
      setPhase({ at: 'done', result: r.value })
      return
    }
    setApplyError(r.error)
    // Main refused or failed: show the plan as it is now (say, Nexus is running after all).
    const again = await attempt('importer:plan')
    setPhase(again.ok ? { at: 'plan', plan: again.value } : { at: 'plan', plan })
  }

  if (phase.at === 'done') {
    const { imported, failed } = phase.result
    const title =
      imported.length === 0 && failed.length === 0
        ? 'Nothing was imported'
        : failed.length === 0
          ? 'Import finished'
          : imported.length === 0
            ? 'Import failed'
            : 'Some accounts weren’t imported'
    return (
      <Dialog
        title={title}
        width={480}
        onClose={close}
        footer={
          <Button variant="primary" data-autofocus onClick={close}>
            Done
          </Button>
        }
      >
        <div ref={body} role="status">
          {imported.length === 0 && failed.length === 0 && (
            <p className="m-0">These accounts were already in Diwan.</p>
          )}
          {imported.length > 0 && (
            <>
              <p className="m-0 text-fg">
                Imported {plural(imported.length, 'account')}. They open already signed in.
              </p>
              <ul className="mt-2 flex flex-col gap-1 pl-0">
                {imported.map((n, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: names can repeat; the list never reorders
                  <li key={i} className="flex items-center gap-2 text-fg">
                    <Icon name="check" size={14} className="shrink-0 text-ok" />
                    <span dir="auto" className="bidi-plain min-w-0 truncate">
                      {n}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        {failed.length > 0 && (
          <Notice tone="error">
            <p className="m-0 font-medium">
              {plural(failed.length, 'account')} couldn’t be imported. Nothing was changed for{' '}
              {failed.length === 1 ? 'it' : 'them'}, and you can try again.
            </p>
            <ul className="mt-1.5 flex flex-col gap-1 pl-0">
              {failed.map((f, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: names can repeat; the list never reorders
                <li key={i} className="text-fg-dim">
                  <span dir="auto" className="bidi-plain font-medium text-fg">
                    {f.name}
                  </span>
                  : {f.error}
                </li>
              ))}
            </ul>
          </Notice>
        )}
        {imported.length > 0 && (
          <p className="mt-3 mb-0">
            Don’t open these accounts in Nexus any more: the same login running in two apps can make WhatsApp
            sign both out. To uninstall Nexus run{' '}
            <code className="font-mono text-[12px] text-fg select-text">sudo pacman -R multiwhatsapp</code>.
          </p>
        )}
      </Dialog>
    )
  }

  const plan = phase.at === 'plan' || phase.at === 'applying' ? phase.plan : null
  const canImport = !!plan?.available && !plan.nexusRunning && !recovery && !busy
  const total = plan?.items.reduce((n, i) => n + i.bytes, 0) ?? 0

  const footer = (
    <>
      <Button variant="ghost" disabled={busy} onClick={close}>
        Cancel
      </Button>
      {plan?.available && (
        <Button variant="primary" disabled={!canImport} onClick={() => void apply(plan)}>
          {busy ? (
            <>
              <Icon name="loader" size={15} className="animate-spin motion-reduce:animate-none" />
              Importing…
            </>
          ) : (
            `Import ${plural(plan.items.length, 'account')}`
          )}
        </Button>
      )}
    </>
  )

  return (
    <Dialog title="Import from Nexus" footer={footer} width={480} onClose={close}>
      <div ref={body}>
        {phase.at === 'loading' && (
          <p role="status" className="m-0">
            Looking for Nexus accounts…
          </p>
        )}
        {phase.at === 'loadFailed' && (
          <Notice tone="error">
            <p className="m-0">Diwan couldn’t read Nexus’s accounts: {phase.error}</p>
            <Button variant="ghost" className="mt-2 h-8" onClick={() => void load()}>
              Try again
            </Button>
          </Notice>
        )}
        {plan && !plan.available && <p className="m-0">{REASONS[plan.reason ?? ''] ?? plan.reason}</p>}
        {plan?.available && (
          <>
            <p className="m-0">
              These accounts move across with their WhatsApp login, so no QR code is needed. Nexus’s own files
              are left as they are.
            </p>
            <ul
              aria-label="Accounts to import"
              className="mt-3 mb-0 flex flex-col overflow-hidden rounded-xl border border-line bg-bg-2 pl-0"
            >
              {plan.items.map((item, i) => (
                <li
                  key={item.sourceId}
                  className={`flex items-center gap-3 px-3.5 py-2.5 ${i ? 'border-t border-line-soft' : ''}`}
                >
                  <span
                    aria-hidden="true"
                    style={{ background: item.color }}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold text-white"
                  >
                    <span dir="auto" className="bidi-plain">
                      {initials(item.name)}
                    </span>
                  </span>
                  {/* The row stays left-aligned; only the name inside follows its own direction. */}
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg-strong">
                    <span dir="auto" className="bidi-plain">
                      {item.name}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-fg-dim">
                    {formatBytes(item.bytes)}
                  </span>
                </li>
              ))}
            </ul>
            {plan.items.length > 1 && (
              <p className="mt-1.5 mb-0 text-right font-mono text-[11px] text-fg-dim">
                {formatBytes(total)} in all
              </p>
            )}
          </>
        )}
        {plan && earlier.length > 0 && (
          <p className="mt-3 mb-0 text-[12px] text-fg-dim">
            Already imported, so left out:{' '}
            {earlier.map((a, i) => (
              <span key={a.id}>
                {i > 0 && ', '}
                <span dir="auto" className="bidi-plain text-fg">
                  {a.name}
                </span>
              </span>
            ))}
            .
          </p>
        )}
        {plan && plan.orphanDirs > 0 && (
          <p className="mt-2 mb-0 text-[12px] text-fg-dim">
            Nexus also has {plural(plan.orphanDirs, 'leftover folder')} from accounts it removed. They are not
            imported.
          </p>
        )}
        {plan?.available && recovery && (
          <Notice tone="warn">
            Diwan’s settings file is damaged, so nothing can be imported until it is fixed (Settings → Data).
          </Notice>
        )}
        {plan?.available && plan.nexusRunning && !busy && (
          <Notice tone="warn">
            <p className="m-0 font-medium text-fg-strong">Quit Nexus first.</p>
            <p className="m-0">
              It is running, and copying a login it is using could sign that account out. Quit it (tray icon →
              Quit), then check again.
            </p>
            <Button variant="ghost" className="mt-2 h-8" onClick={() => void load()}>
              Check again
            </Button>
          </Notice>
        )}
        {applyError && !busy && (
          <Notice tone="error">
            <p className="m-0">Import failed: {applyError}</p>
          </Notice>
        )}
        {busy && plan && (
          <div role="status" className="mt-3">
            <p className="m-0 text-fg">
              Copying {plural(plan.items.length, 'account')} ({formatBytes(total)})… Keep Nexus closed until
              this finishes.
            </p>
            <div
              role="progressbar"
              aria-label="Importing"
              className="mt-2 h-1 overflow-hidden rounded-full bg-bg-4"
            >
              <div className="h-full w-1/3 animate-pulse rounded-full bg-accent motion-reduce:animate-none" />
            </div>
          </div>
        )}
      </div>
    </Dialog>
  )
}
