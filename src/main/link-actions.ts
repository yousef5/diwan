import { shell, type WebContents } from 'electron'
import type { LinkAction } from './link-policy'
import type { Logger } from './log'
import { createRateLimiter } from './rate-limit'

const allowExternal = createRateLimiter(5, 10_000)

export function performLink(action: LinkAction, wc: WebContents, log: Logger): void {
  switch (action.kind) {
    case 'internal':
      return
    case 'chat':
      void wc.loadURL(action.url)
      return
    case 'external':
      if (!allowExternal(wc.id)) {
        log.warn('external link dropped: too many in 10 s')
        return
      }
      shell.openExternal(action.url).catch((e) => log.warn('openExternal failed', e))
      return
    case 'download':
      wc.downloadURL(action.url)
      return
    case 'blocked':
      log.warn('blocked a link', { reason: action.reason })
  }
}
