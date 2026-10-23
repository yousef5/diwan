import { DiwanMark } from '../icons'
import { importOffered } from '../platform'
import { useUi } from '../state'
import { Button } from '../ui/Button'

// The stage before any account exists. Adding is off in recovery mode (nothing could be saved).
export function EmptyState() {
  const importAvailable = useUi((s) => importOffered(s.snap))
  const recovery = useUi((s) => s.snap?.recovery ?? false)
  const openDialog = useUi((s) => s.openDialog)
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="flex w-[400px] max-w-full flex-col items-center gap-3 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-line-strong bg-bg-3 text-fg">
          <DiwanMark size={34} />
        </span>
        <h1 className="mt-2 text-[22px] font-semibold text-fg-strong">Welcome to Diwan</h1>
        <p className="m-0 text-[13px] leading-relaxed text-fg-dim">
          Add your WhatsApp accounts. Each one keeps its own login, notifications and unread count.
        </p>
        <div className="mt-3 flex gap-2">
          <Button variant="primary" disabled={recovery} onClick={() => openDialog({ kind: 'add' })}>
            Add account
          </Button>
          {importAvailable && (
            <Button variant="ghost" disabled={recovery} onClick={() => openDialog({ kind: 'import' })}>
              Import from Nexus
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
