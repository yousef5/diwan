import { NID_PATTERN } from '../shared/nid'

// Pure helpers for the guest preload (no electron import, so they are unit-testable).

export const AVATAR_FIRST_MS = 4000 // WhatsApp needs a moment to draw its UI
export const AVATAR_RETRY_MS = 6000
export const AVATAR_MAX_MS = 60_000

// 6 s, 12 s, 24 s, 48 s, then every minute. It never gives up: an account can sit on the QR
// screen for a long time and should still get its picture right after the phone links it.
export function avatarRetryDelay(failures: number): number {
  return Math.min(AVATAR_MAX_MS, AVATAR_RETRY_MS * 2 ** Math.max(0, failures - 1))
}

// Looks for the own profile picture until one is found, sends it once, then stops. Attempts never
// overlap: the next one is scheduled only after the previous lookup settled. Returns a stop function.
export function watchAvatar(find: () => Promise<string | null>, send: (dataUrl: string) => void): () => void {
  let stopped = false
  let failures = 0
  const attempt = async (): Promise<void> => {
    let url: string | null = null
    try {
      url = await find()
    } catch {
      url = null
    }
    if (stopped) return
    if (url) {
      stopped = true
      send(url)
      return
    }
    failures += 1
    timer = setTimeout(attempt, avatarRetryDelay(failures))
  }
  let timer = setTimeout(attempt, AVATAR_FIRST_MS)
  return () => {
    stopped = true
    clearTimeout(timer)
  }
}

// The nid of a main → guest click message, or null for anything malformed.
export function clickNid(msg: unknown): string | null {
  const nid = typeof msg === 'object' && msg !== null ? (msg as { nid?: unknown }).nid : undefined
  return typeof nid === 'string' && NID_PATTERN.test(nid) ? nid : null
}

// Token bucket: starts full with `capacity` tokens and refills `capacity` per `windowMs`, smoothly.
// Each allowed call takes one token. Used in the guest preload, before ipcRenderer.send, so a
// page looping on the notify bridge never turns into a flood of IPC messages to main.
export function tokenBucket(
  capacity: number,
  windowMs: number,
  now: () => number = () => performance.now(), // monotonic: refill is interval math
): () => boolean {
  let tokens = capacity
  let last = now()
  return () => {
    const t = now()
    tokens = Math.min(capacity, tokens + (Math.max(0, t - last) * capacity) / windowMs)
    last = t
    if (tokens < 1) return false
    tokens -= 1
    return true
  }
}
