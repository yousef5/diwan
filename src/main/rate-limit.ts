// Sliding-window limiter: at most `max` calls per `windowMs` for each key.
export function createRateLimiter(
  max: number,
  windowMs: number,
  now: () => number = Date.now,
): (key: string | number) => boolean {
  const hits = new Map<string | number, number[]>()
  return (key) => {
    const t = now()
    const recent = (hits.get(key) ?? []).filter((h) => t - h < windowMs)
    const allowed = recent.length < max
    if (allowed) recent.push(t)
    hits.set(key, recent)
    return allowed
  }
}
