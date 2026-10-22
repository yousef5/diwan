// Runs in WhatsApp's MAIN world through contextBridge.executeInMainWorld, which serialises it
// with Function.toString(). So: no imports, no outer variables, no class fields (bundler helpers
// would be left behind). Everything it needs is declared inside.
export function installNotificationShim(): void {
  interface Bridge {
    show(payload: unknown): void
    close(nid: string): void
  }
  interface ShimNote extends EventTarget {
    nid: string
    title: string
    body: string
    tag: string
    icon: string
    silent: boolean
    data: unknown
    onclick: ((this: ShimNote, ev: Event) => unknown) | null
    onclose: ((this: ShimNote, ev: Event) => unknown) | null
    onshow: ((this: ShimNote, ev: Event) => unknown) | null
    onerror: ((this: ShimNote, ev: Event) => unknown) | null
  }
  const w = window as unknown as {
    __diwanNotify?: Bridge
    __diwanShimmed?: boolean
    __diwanClick?: (nid: string) => void
  }
  const found = w.__diwanNotify
  if (!found || w.__diwanShimmed) return
  const bridge: Bridge = found
  w.__diwanShimmed = true

  // Main keeps its own bounded book and never reports a desktop dismissal here, so cap this side too.
  const MAX_LIVE = 100
  // Main's IPC contract (src/shared/ipc.ts) rejects longer texts and bigger icons outright.
  const MAX_TITLE = 500
  const MAX_BODY = 4000
  const MAX_TAG = 500
  const MAX_ICON = 512_000
  const live = new Map<string, ShimNote>() // insertion order = age
  let seq = 0
  // nids restart on every page load; a per-page token keeps an old click from matching a new notification
  const pageToken = Math.random().toString(36).slice(2, 10) || '0'

  // Re-encode to a small PNG inside the page: Electron's nativeImage can't decode WebP, and main
  // only accepts PNG/JPEG with capped dimensions. Gives '' when anything fails.
  const toPngDataUrl = (src: string, max: number): Promise<string> => {
    if (!src || typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function')
      return Promise.resolve('')
    const work = fetch(src)
      .then((r) => r.blob())
      .then((blob) => createImageBitmap(blob))
      .then(async (bmp) => {
        const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
        const w = Math.max(1, Math.round(bmp.width * scale))
        const h = Math.max(1, Math.round(bmp.height * scale))
        const canvas = new OffscreenCanvas(w, h)
        canvas.getContext('2d')?.drawImage(bmp, 0, 0, w, h)
        bmp.close()
        const png = await canvas.convertToBlob({ type: 'image/png' })
        return new Promise<string>((resolve) => {
          const fr = new FileReader()
          fr.onload = () => resolve(String(fr.result))
          fr.onerror = () => resolve('')
          fr.readAsDataURL(png)
        })
      })
    const timeout = new Promise<string>((resolve) => setTimeout(() => resolve(''), 1500))
    return Promise.race([work, timeout]).catch(() => '')
  }

  class DiwanNotification extends EventTarget {
    constructor(title: string, options: NotificationOptions & { icon?: string } = {}) {
      super()
      const self = this as unknown as ShimNote
      self.title = String(title)
      self.body = String(options.body ?? '')
      self.tag = String(options.tag ?? '')
      self.icon = String(options.icon ?? '')
      self.silent = Boolean(options.silent)
      self.data = options.data ?? null
      self.onclick = null
      self.onclose = null
      self.onshow = null
      self.onerror = null
      seq += 1
      self.nid = `${pageToken}-${seq}`
      live.set(self.nid, self)
      if (live.size > MAX_LIVE) {
        const oldest = live.keys().next().value
        if (oldest !== undefined) live.delete(oldest)
      }
      void toPngDataUrl(self.icon, 256).then((icon) => {
        // WhatsApp may close it (read on the phone) while the icon was still being prepared.
        if (live.get(self.nid) !== self) return
        bridge.show({
          nid: self.nid,
          title: self.title.slice(0, MAX_TITLE),
          body: self.body.slice(0, MAX_BODY),
          tag: self.tag.slice(0, MAX_TAG),
          icon: icon.startsWith('data:image/png;base64,') && icon.length <= MAX_ICON ? icon : '',
          silent: self.silent,
        })
      })
      setTimeout(() => {
        const ev = new Event('show')
        self.onshow?.call(self, ev)
        self.dispatchEvent(ev)
      }, 0)
    }

    static get permission(): NotificationPermission {
      return 'granted'
    }

    static requestPermission(
      callback?: (p: NotificationPermission) => void,
    ): Promise<NotificationPermission> {
      callback?.('granted')
      return Promise.resolve('granted')
    }

    static get maxActions(): number {
      return 0
    }

    close(): void {
      const self = this as unknown as ShimNote
      if (live.get(self.nid) !== self) return
      live.delete(self.nid)
      bridge.close(self.nid)
      const ev = new Event('close')
      self.onclose?.call(self, ev)
      self.dispatchEvent(ev)
    }
  }

  w.__diwanClick = (nid: string) => {
    const n = live.get(nid)
    if (!n) return
    live.delete(nid)
    window.focus()
    const ev = new Event('click', { cancelable: true })
    n.onclick?.call(n, ev)
    n.dispatchEvent(ev)
  }

  Object.defineProperty(window, 'Notification', {
    value: DiwanNotification,
    writable: true,
    configurable: true,
  })
}
