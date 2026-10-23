import { call } from '../api'
import { Icon } from '../icons'
import { hasCaptionButtons } from '../platform'
import { type DialogState, useUi } from '../state'
import { Button } from '../ui/Button'

// The confirmation behind every "Start fresh" button (this banner, Settings → Data).
export const START_FRESH: DialogState = {
  kind: 'confirm',
  title: 'Start with fresh settings?',
  body: 'The damaged file is kept next to the new one (renamed .broken). Your accounts will need to be added or imported again.',
  confirmLabel: 'Start fresh',
  danger: false,
  onConfirm: () => void call('app:startFresh'),
}

// Recovery mode: the settings file (and its backup) could not be read, so main runs read-only and
// never overwrites it. Starting fresh keeps the damaged file next to the new one.
export function RecoveryBanner() {
  const recovery = useUi((s) => s.snap?.recovery ?? false)
  // At the top of the window: on Windows its buttons keep clear of the caption buttons.
  const captions = useUi((s) => hasCaptionButtons(s.snap))
  const openDialog = useUi((s) => s.openDialog)
  if (!recovery) return null
  return (
    <div
      role="alert"
      className={`flex shrink-0 items-center gap-3 border-b border-warn/40 bg-warn/10 py-2 pl-4 text-[13px] text-fg ${
        captions ? 'pr-[calc(1rem+var(--caption-w))]' : 'pr-4'
      }`}
    >
      <Icon name="alert" size={16} className="shrink-0 text-warn" />
      <span className="flex-1">
        Diwan’s settings file is damaged, so nothing is being saved. Your WhatsApp logins are still safe on
        disk.
      </span>
      <Button variant="ghost" size="sm" className="shrink-0" onClick={() => void call('app:openDataFolder')}>
        Open folder
      </Button>
      <Button variant="subtle" size="sm" className="shrink-0" onClick={() => openDialog(START_FRESH)}>
        Start fresh
      </Button>
    </div>
  )
}
