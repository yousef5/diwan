interface Entry<N> {
  n: N
  tagKey: string | null
}

// Bookkeeping for live notifications. Bounded per account (the desktop may never report 'close'),
// namespaced per account (nids restart after a guest reload) and identity-safe on cleanup.
export class NotificationBook<N> {
  private live = new Map<string, Entry<N>>() // `${accountId}:${nid}` (insertion order = age)
  private byTag = new Map<string, string>() // `${accountId}:${tag}` → live key

  constructor(
    private readonly closeFn: (n: N) => void,
    private readonly perAccountCap = 100,
  ) {}

  private keyOf(accountId: string, nid: string): string {
    return `${accountId}:${nid}`
  }

  private remove(key: string): Entry<N> | undefined {
    const e = this.live.get(key)
    if (!e) return undefined
    this.live.delete(key)
    if (e.tagKey && this.byTag.get(e.tagKey) === key) this.byTag.delete(e.tagKey)
    return e
  }

  private safeClose(n: N): void {
    try {
      this.closeFn(n)
    } catch {}
  }

  add(accountId: string, nid: string, tag: string, n: N): void {
    const key = this.keyOf(accountId, nid)
    const old = this.remove(key)
    if (old) this.safeClose(old.n)
    let tagKey: string | null = null
    if (tag) {
      tagKey = `${accountId}:${tag}`
      const prevKey = this.byTag.get(tagKey)
      if (prevKey) {
        const prev = this.remove(prevKey)
        if (prev) this.safeClose(prev.n)
      }
      this.byTag.set(tagKey, key)
    }
    this.live.set(key, { n, tagKey })
    const prefix = `${accountId}:`
    const mine = [...this.live.keys()].filter((k) => k.startsWith(prefix))
    for (const k of mine.slice(0, Math.max(0, mine.length - this.perAccountCap))) {
      const e = this.remove(k)
      if (e) this.safeClose(e.n)
    }
  }

  take(accountId: string, nid: string): N | undefined {
    return this.remove(this.keyOf(accountId, nid))?.n
  }

  forget(accountId: string, nid: string, n: N): void {
    const key = this.keyOf(accountId, nid)
    if (this.live.get(key)?.n === n) this.remove(key)
  }

  close(accountId: string, nid: string): void {
    const e = this.remove(this.keyOf(accountId, nid))
    if (e) this.safeClose(e.n)
  }

  forgetAccount(accountId: string): void {
    const prefix = `${accountId}:`
    for (const k of [...this.live.keys()]) {
      if (!k.startsWith(prefix)) continue
      const e = this.remove(k)
      if (e) this.safeClose(e.n)
    }
  }
}
