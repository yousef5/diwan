// Windows: Defender, the search indexer or a backup tool can hold a file for a moment, so a rename
// or delete fails with EPERM/EACCES/EBUSY and works a few ms later. Elsewhere these are real errors.
const TRANSIENT = new Set(['EPERM', 'EACCES', 'EBUSY'])
export const RETRY_DELAYS_MS: readonly number[] = [25, 50, 100, 200]

export interface RetryOptions {
  platform?: NodeJS.Platform
  delays?: readonly number[]
  sleep?: (ms: number) => void
}

const isTransient = (e: unknown): boolean => TRANSIENT.has((e as NodeJS.ErrnoException)?.code ?? '')

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

// Runs fn; on win32 a transient failure is retried after each delay in turn (blocking, ≤375 ms).
export function retrySync<T>(fn: () => T, opts: RetryOptions = {}): T {
  if ((opts.platform ?? process.platform) !== 'win32') return fn()
  const delays = opts.delays ?? RETRY_DELAYS_MS
  const sleep = opts.sleep ?? sleepSync
  for (let i = 0; ; i++) {
    try {
      return fn()
    } catch (e) {
      if (i >= delays.length || !isTransient(e)) throw e
      sleep(delays[i])
    }
  }
}

export async function retryAsync<T>(
  fn: () => Promise<T>,
  opts: Omit<RetryOptions, 'sleep'> = {},
): Promise<T> {
  if ((opts.platform ?? process.platform) !== 'win32') return fn()
  const delays = opts.delays ?? RETRY_DELAYS_MS
  for (let i = 0; ; i++) {
    try {
      return await fn()
    } catch (e) {
      if (i >= delays.length || !isTransient(e)) throw e
      await new Promise((r) => setTimeout(r, delays[i]))
    }
  }
}

// fs.rm has its own retry loop for the same Windows errors; it is off by default.
export function rmRetryOptions(platform: NodeJS.Platform = process.platform): {
  maxRetries?: number
  retryDelay?: number
} {
  return platform === 'win32' ? { maxRetries: 5, retryDelay: 200 } : {}
}
