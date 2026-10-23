import { call } from '../api'
import { Icon } from '../icons'
import { windowControlsShown } from '../platform'
import { useUi } from '../state'

// The window is always frameless (main creates it with frame: false): on Hyprland the compositor
// draws the frame. This 32 px bar with minimize, maximize and close is for floating window
// managers, only when Settings → General → "Show window controls" is on. The bar itself drags
// the window. Never on Windows, which has its own caption buttons (titleBarOverlay).
export function WindowControls() {
  const show = useUi((s) => windowControlsShown(s.snap))
  if (!show) return null
  const base = 'no-drag flex h-8 w-11 items-center justify-center text-fg-dim'
  const btn = `${base} hover:bg-bg-3 hover:text-fg`
  return (
    <div className="drag flex h-8 shrink-0 items-center justify-end border-b border-line bg-bg-1">
      <button
        type="button"
        aria-label="Minimize"
        className={btn}
        onClick={() => void call('window:minimize')}
      >
        <Icon name="minus" size={14} />
      </button>
      <button
        type="button"
        aria-label="Maximize"
        className={btn}
        onClick={() => void call('window:toggleMaximize')}
      >
        <Icon name="square" size={12} />
      </button>
      <button
        type="button"
        aria-label="Close"
        className={`${base} hover:bg-danger-strong hover:text-white`}
        onClick={() => void call('window:close')}
      >
        <Icon name="x" size={14} />
      </button>
    </div>
  )
}
