// Reads pixel dimensions from image headers without decoding (decompression-bomb guard).
type Dims = { width: number; height: number }

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1]
const u32be = (b: Uint8Array, i: number) =>
  ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0
const ascii = (b: Uint8Array, i: number, s: string) => [...s].every((c, k) => b[i + k] === c.charCodeAt(0))

function png(b: Uint8Array): Dims | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (b.length < 24 || !sig.every((v, i) => b[i] === v) || !ascii(b, 12, 'IHDR')) return null
  return { width: u32be(b, 16), height: u32be(b, 20) }
}

function jpeg(b: Uint8Array): Dims | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null
  let i = 2
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null
    const marker = b[i + 1]
    if (marker === 0xff) {
      i++
      continue
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2
      continue
    }
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (i + 9 > b.length) return null
      return { height: u16be(b, i + 5), width: u16be(b, i + 7) }
    }
    if (marker === 0xd9 || marker === 0xda) return null
    const len = u16be(b, i + 2)
    if (len < 2) return null
    i += 2 + len
  }
  return null
}

function webp(b: Uint8Array): Dims | null {
  if (b.length < 30 || !ascii(b, 0, 'RIFF') || !ascii(b, 8, 'WEBP')) return null
  if (ascii(b, 12, 'VP8X')) {
    const w = 1 + (b[24] | (b[25] << 8) | (b[26] << 16))
    const h = 1 + (b[27] | (b[28] << 8) | (b[29] << 16))
    return { width: w, height: h }
  }
  if (ascii(b, 12, 'VP8L')) {
    if (b[20] !== 0x2f) return null
    const bits = (b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) >>> 0
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff) }
  }
  if (ascii(b, 12, 'VP8 ')) {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null
    return { width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff }
  }
  return null
}

export function imageDims(bytes: Uint8Array): Dims | null {
  const d = png(bytes) ?? jpeg(bytes) ?? webp(bytes)
  return d && d.width > 0 && d.height > 0 ? d : null
}

export function dataUrlDims(url: string): Dims | null {
  const m = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]*={0,2})$/.exec(url)
  if (!m) return null
  try {
    const bin = atob(m[1])
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return imageDims(bytes)
  } catch {
    return null
  }
}

export const dataUrlFits = (url: string, maxW: number, maxH: number): boolean => {
  const d = dataUrlDims(url)
  return d !== null && d.width <= maxW && d.height <= maxH
}
