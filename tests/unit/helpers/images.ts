export const PNG_1x1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

export function pngHeader(w: number, h: number): Buffer {
  const b = Buffer.alloc(33)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0)
  b.writeUInt32BE(13, 8)
  b.write('IHDR', 12, 'ascii')
  b.writeUInt32BE(w, 16)
  b.writeUInt32BE(h, 20)
  return b
}
export function jpegHeader(w: number, h: number): Buffer {
  const b = Buffer.alloc(30)
  b.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00], 0) // SOI + APP0 (len 4)
  b.set([0xff, 0xc0, 0x00, 0x11, 0x08], 8)
  b.writeUInt16BE(h, 13)
  b.writeUInt16BE(w, 15)
  return b
}
export function webpVp8l(w: number, h: number): Buffer {
  const b = Buffer.alloc(30)
  b.write('RIFF', 0, 'ascii')
  b.write('WEBP', 8, 'ascii')
  b.write('VP8L', 12, 'ascii')
  b[20] = 0x2f
  b.writeUInt32LE(((w - 1) | ((h - 1) << 14)) >>> 0, 21)
  return b
}
export const url = (mime: string, b: Buffer) => `data:image/${mime};base64,${b.toString('base64')}`
