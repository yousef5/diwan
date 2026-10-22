export interface HangSource {
  on(event: 'unresponsive' | 'responsive' | 'destroyed', listener: () => void): unknown
}

// Chromium reports 'unresponsive' after about 17 s of a frozen page, repeats about every 16 s,
// and only fires when input reaches the guest. Give it 10 s more, then ask for a remount once
// (a latch holds until 'responsive'). Never forcefullyCrashRenderer a webview guest: that takes the main
// process down ~30 s later (seen in Nexus).
export function watchHang(wc: HangSource, onHung: () => void, graceMs = 10_000): void {
  let timer: ReturnType<typeof setTimeout> | null = null
  let fired = false
  const clear = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }
  wc.on('unresponsive', () => {
    if (timer || fired) return
    timer = setTimeout(() => {
      timer = null
      fired = true
      onHung()
    }, graceMs)
  })
  wc.on('responsive', () => {
    fired = false
    clear()
  })
  wc.on('destroyed', clear)
}
