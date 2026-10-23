import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import { StateHub } from '../../src/main/state'
import { Store } from '../../src/main/store/store'
import { createTrayNotice, TRAY_NOTICE } from '../../src/main/tray-notice'

function harness(opts: { shown?: boolean; supported?: boolean } = {}) {
  let shown = opts.shown ?? false
  const notify = vi.fn((_t: string, _b: string) => opts.supported ?? true)
  const notice = createTrayNotice({
    shown: () => shown,
    markShown: () => {
      shown = true
    },
    notify,
    warn: vi.fn(),
  })
  return { notice, notify, isShown: () => shown }
}

describe('the one-time still-running notice', () => {
  test('shows once, on the first close to the tray, and is remembered', () => {
    const { notice, notify, isShown } = harness()
    notice.hiddenByClose()
    notice.hiddenByClose()
    expect(notify).toHaveBeenCalledOnce()
    expect(notify).toHaveBeenCalledWith(TRAY_NOTICE.title, TRAY_NOTICE.body)
    expect(isShown()).toBe(true)
  })

  test('never once it was shown in an earlier run', () => {
    const { notice, notify } = harness({ shown: true })
    notice.hiddenByClose()
    expect(notify).not.toHaveBeenCalled()
  })

  test('no notifications on this desktop: not remembered, and not retried this run', () => {
    const { notice, notify, isShown } = harness({ supported: false })
    notice.hiddenByClose()
    notice.hiddenByClose()
    expect(notify).toHaveBeenCalledOnce()
    expect(isShown()).toBe(false)
  })

  test('the hub persists the flag in the settings file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'diwan-notice-'))
    const hub = new StateHub(new Store(dir, 0), undefined, 0)
    const changed = vi.fn()
    hub.on('changed', changed)
    expect(hub.trayNoticeShown()).toBe(false)
    hub.markTrayNoticeShown()
    expect(hub.trayNoticeShown()).toBe(true)
    expect(new Store(dir, 0).get().trayNoticeShown).toBe(true)
    expect(changed).not.toHaveBeenCalled()
  })
})
