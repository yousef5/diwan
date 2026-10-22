export interface HangSource {
  on(event: 'unresponsive' | 'responsive' | 'destroyed', listener: () => void): unknown
}

// Chromium reports 'unresponsive' after a few seconds of a frozen page. Give it 10 s more,
// then ask for a remount. Never forcefullyCrashRenderer a webview guest: that takes the main
// process down ~30 s later (seen in Nexus).
export function watchHang(wc: HangSource, onHung: () => void, graceMs = 10_000): void {
  let timer: ReturnType<typeof setTimeout> | null = null
  const clear = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }
  wc.on('unresponsive', () => {
    if (timer) return
    timer = setTimeout(() => {
      timer = null
      onHung()
    }, graceMs)
  })
  wc.on('responsive', clear)
  wc.on('destroyed', clear)
}
