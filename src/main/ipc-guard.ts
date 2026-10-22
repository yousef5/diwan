import type { z } from 'zod'
import type { GuestChannel } from '../shared/ipc'
import type { Logger } from './log'
import { createRateLimiter } from './rate-limit'

// Pure wrappers around ipcMain listeners (no electron import, so they are unit-testable
// with fake events). Every handler runs inside try/catch: a throw inside an ipcMain.on
// listener would otherwise become an uncaughtException and pop Electron's error dialog.

export interface IpcEventLike {
  sender: { id: number }
}

const shortMessage = (e: unknown): string => {
  const msg = e instanceof Error ? e.message : String(e)
  return (msg.split('\n')[0] ?? '').slice(0, 200)
}

export function guardShell<E extends IpcEventLike>(opts: {
  winWebContentsId(): number | undefined
  isMainFrame(e: E): boolean
  log: Logger
}) {
  return function wrap<S extends z.ZodType>(
    channel: string,
    schema: S,
    fn: (payload: z.output<S>) => unknown,
  ): (event: E, raw: unknown) => Promise<unknown> {
    return async (event, raw) => {
      const winId = opts.winWebContentsId()
      if (winId === undefined || event.sender.id !== winId || !opts.isMainFrame(event)) {
        opts.log.warn('forbidden shell call', { channel })
        throw new Error(`${channel}: forbidden`)
      }
      const parsed = schema.safeParse(raw)
      if (!parsed.success) {
        opts.log.warn('invalid shell payload', { channel })
        throw new Error(`${channel}: invalid payload`)
      }
      try {
        return await fn(parsed.data)
      } catch (e) {
        opts.log.error(`${channel} failed`, e)
        const err = new Error(shortMessage(e))
        err.stack = undefined
        throw err
      }
    }
  }
}

export function guardGuest<E extends IpcEventLike>(opts: {
  accountOf(senderId: number): string | undefined
  isWhatsAppMainFrame(e: E): boolean
  log: Logger
  limits?: Partial<Record<GuestChannel, (key: string) => boolean>>
}) {
  // A page sending garbage in a loop must not fill (and rotate away) the log: one line per
  // channel per account per minute, for each kind of drop (key prefix).
  const allowLog = createRateLimiter(1, 60_000)
  return function wrap<S extends z.ZodType>(
    channel: GuestChannel,
    schema: S,
    fn: (accountId: string, payload: z.output<S>, event: E) => void,
  ): (event: E, raw: unknown) => void {
    return (event, raw) => {
      try {
        const accountId = opts.accountOf(event.sender.id)
        if (!accountId || !opts.isWhatsAppMainFrame(event)) return
        const limit = opts.limits?.[channel]
        if (limit && !limit(accountId)) {
          // throttled before any parsing work
          if (allowLog(`throttled\u0000${channel}\u0000${accountId}`))
            opts.log.warn('guest channel throttled', { channel })
          return
        }
        const parsed = schema.safeParse(raw)
        if (!parsed.success) {
          if (allowLog(`invalid\u0000${channel}\u0000${accountId}`))
            opts.log.warn('invalid guest payload', { channel })
          return
        }
        fn(accountId, parsed.data, event)
      } catch (e) {
        opts.log.error(`${channel} failed`, e)
      }
    }
  }
}

// Per-account limits checked before any parsing: a hostile page looping on the bridge costs
// almost nothing. WhatsApp itself stays far below them.
export function guestLimits(
  now: () => number = () => performance.now(),
): Partial<Record<GuestChannel, (key: string) => boolean>> {
  return {
    'guest:avatar': createRateLimiter(1, 30_000, now),
    'guest:notify': createRateLimiter(30, 10_000, now),
    'guest:notify-close': createRateLimiter(200, 10_000, now),
  }
}
