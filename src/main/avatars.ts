import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { type NativeImage, nativeImage } from 'electron'
import { imageDims } from '../shared/image-dims'
import { AccountId } from '../shared/validators'

const SIZE = 128
const MAX_FILE_BYTES = 10 * 1024 * 1024
const MAX_DIM = 4096

function normalize(img: NativeImage): NativeImage | null {
  if (img.isEmpty()) return null
  const { width, height } = img.getSize()
  const side = Math.min(width, height)
  return img
    .crop({
      x: Math.floor((width - side) / 2),
      y: Math.floor((height - side) / 2),
      width: side,
      height: side,
    })
    .resize({ width: SIZE, height: SIZE, quality: 'best' })
}

// <userData>/avatars/<accountId>.png, square 128 px. Returned as data URLs for the shell.
export class AvatarFiles {
  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true, mode: 0o700 })
  }

  load(id: string): string | null {
    const file = this.file(id)
    if (!existsSync(file)) return null
    const img = nativeImage.createFromPath(file)
    return img.isEmpty() ? null : img.toDataURL()
  }

  save(id: string, img: NativeImage): string | null {
    const n = normalize(img)
    if (!n) return null
    const file = this.file(id)
    const tmp = `${file}.tmp`
    writeFileSync(tmp, n.toPNG(), { mode: 0o600 })
    renameSync(tmp, file)
    return n.toDataURL()
  }

  // Header-checked import from disk: size and pixel dimensions are validated before decoding.
  saveFromFile(id: string, path: string): string | null {
    this.file(id)
    try {
      if (statSync(path).size > MAX_FILE_BYTES) return null
      const head = Buffer.alloc(64 * 1024)
      const fd = openSync(path, 'r')
      let len: number
      try {
        len = readSync(fd, head, 0, head.length, 0)
      } finally {
        closeSync(fd)
      }
      const dims = imageDims(head.subarray(0, len))
      if (!dims || dims.width > MAX_DIM || dims.height > MAX_DIM) return null
    } catch {
      return null
    }
    return this.save(id, nativeImage.createFromPath(path))
  }

  remove(id: string): void {
    rmSync(this.file(id), { force: true })
  }

  private file(id: string): string {
    if (!AccountId.safeParse(id).success) throw new Error('invalid account id')
    return join(this.dir, `${id}.png`)
  }
}
