import { closeSync, openSync, readSync, statSync } from 'node:fs'
import { imageDims } from '../shared/image-dims'

const MAX_FILE_BYTES = 10 * 1024 * 1024
const HEADER_BYTES = 256 * 1024
const MAX_SIDE = 16_384
const MAX_PIXELS = 40_000_000

// Header-only check, before any decoding: regular file, sane size, parseable, within a pixel budget.
export function avatarFileOk(path: string): boolean {
  try {
    const st = statSync(path)
    if (!st.isFile() || st.size > MAX_FILE_BYTES) return false
    const head = Buffer.alloc(HEADER_BYTES)
    const fd = openSync(path, 'r')
    let len: number
    try {
      len = readSync(fd, head, 0, head.length, 0)
    } finally {
      closeSync(fd)
    }
    const d = imageDims(head.subarray(0, len))
    return (
      !!d &&
      d.width > 0 &&
      d.height > 0 &&
      d.width <= MAX_SIDE &&
      d.height <= MAX_SIDE &&
      d.width * d.height <= MAX_PIXELS
    )
  } catch {
    return false
  }
}
