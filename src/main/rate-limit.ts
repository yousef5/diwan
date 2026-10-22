// Sliding-window limiter: at most `max` calls per `windowMs` for each key.
// Interval math runs on the monotonic clock: with Date.now a backward wall-clock step (NTP, a
// manual change) kept every old hit "recent" until the clock caught up, closing the limiter for
// as long as the step. A hit that lies in the future of `now` is dropped too, so even an injected
// clock that jumps back reopens the limiter instead of freezing it.
export function createRateLimiter(
  max: number,
  windowMs: number,
  now: () => number = () => performance.now(),
): (key: string | number) => boolean {
  const hits = new Map<string | number, number[]>()
  return (key) => {
    const t = now()
    const recent = (hits.get(key) ?? []).filter((h) => h <= t && t - h < windowMs)
    const allowed = recent.length < max
    if (allowed) recent.push(t)
    hits.set(key, recent)
    return allowed
  }
}
