// Best effort: find the user's own profile picture in WhatsApp Web. Own picture sits inside the
// left nav rail (new layout) or the top-left header (old layout); contact pictures don't.
export interface AvatarCandidate {
  top: number
  left: number
  width: number
  height: number
  alt: string
  round: boolean
}

export const MIN_SCORE = 250
const MAX_SIDE = 256
const TIMEOUT_MS = 5000

export function scoreAvatar(c: AvatarCandidate): number {
  if (c.width < 15 || c.height < 15 || c.width > 100 || c.height > 100) return -1
  let score = 0
  if (c.left + c.width <= 80) score += 150
  if (c.top < 70) score += 200
  else if (c.top < 120) score += 50
  if (c.width >= 30 && c.width <= 50) score += 80
  else if (c.width >= 20 && c.width <= 60) score += 40
  if (c.alt) score += 50
  if (c.round) score += 60
  return score
}

export function pickAvatar(doc: Document): HTMLImageElement | null {
  let best: HTMLImageElement | null = null
  let bestScore = -1
  for (const img of Array.from(doc.querySelectorAll('img'))) {
    if (!img.src || img.src.startsWith('data:image/gif') || /emoji|status/.test(img.src)) continue
    const r = img.getBoundingClientRect()
    const radius = getComputedStyle(img).borderRadius
    const score = scoreAvatar({
      top: r.top,
      left: r.left,
      width: r.width,
      height: r.height,
      alt: img.alt,
      round: radius === '50%' || Number.parseInt(radius, 10) > 15,
    })
    if (score > bestScore) {
      best = img
      bestScore = score
    }
  }
  return best && bestScore >= MIN_SCORE ? best : null
}

async function toPngDataUrl(src: string): Promise<string | null> {
  const bmp = await createImageBitmap(await (await fetch(src)).blob())
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
  const w = Math.max(1, Math.round(bmp.width * scale))
  const h = Math.max(1, Math.round(bmp.height * scale))
  const canvas = new OffscreenCanvas(w, h)
  canvas.getContext('2d')?.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  const png = await canvas.convertToBlob({ type: 'image/png' })
  const url = await new Promise<string | null>((resolve) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result))
    fr.onerror = () => resolve(null)
    fr.readAsDataURL(png)
  })
  return url?.startsWith('data:image/png;base64,') ? url : null
}

// Re-encoded to a PNG of at most 256 px: main accepts only PNG/JPEG with capped dimensions,
// and Electron can't decode WebP. Gives null on any failure, and after 5 s at most, so a hung
// download never stops the caller from trying again later.
export async function findAvatarDataUrl(doc: Document): Promise<string | null> {
  const img = pickAvatar(doc)
  if (!img) return null
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), TIMEOUT_MS)
  })
  try {
    return await Promise.race([toPngDataUrl(img.src), timeout])
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
