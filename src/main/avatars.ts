import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type NativeImage, nativeImage } from 'electron'
import { AccountId } from '../shared/validators'
import { avatarFileOk } from './avatar-check'

const SIZE = 128

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
    if (!avatarFileOk(path)) return null
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
