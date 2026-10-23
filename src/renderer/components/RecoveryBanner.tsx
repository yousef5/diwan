import { call } from '../api'
import { Icon } from '../icons'
import { useUi } from '../state'
import { Button } from '../ui/Button'

// Recovery mode: the settings file (and its backup) could not be read, so main runs read-only and
// never overwrites it. Starting fresh keeps the damaged file next to the new one.
export function RecoveryBanner() {
  const recovery = useUi((s) => s.snap?.recovery ?? false)
  const openDialog = useUi((s) => s.openDialog)
  if (!recovery) return null
  return (
    <div
      role="alert"
      className="flex shrink-0 items-center gap-3 border-b border-warn/40 bg-warn/10 px-4 py-2 text-[13px] text-fg"
    >
      <Icon name="alert" size={16} className="shrink-0 text-warn" />
      <span className="flex-1">
        Diwan’s settings file is damaged, so nothing is being saved. Your WhatsApp logins are still safe on
        disk.
      </span>
      <Button variant="ghost" className="h-8 shrink-0" onClick={() => void call('app:openDataFolder')}>
        Open folder
      </Button>
      <Button
        variant="subtle"
        className="h-8 shrink-0"
        onClick={() =>
          openDialog({
            kind: 'confirm',
            title: 'Start with fresh settings?',
            body: 'The damaged file is kept next to the new one (renamed .broken). Your accounts will need to be added or imported again.',
            confirmLabel: 'Start fresh',
            danger: false,
            onConfirm: () => void call('app:startFresh'),
          })
        }
      >
        Start fresh
      </Button>
    </div>
  )
}
