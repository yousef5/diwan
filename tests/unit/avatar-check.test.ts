import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { avatarFileOk } from '../../src/main/avatar-check'
import { jpegHeader } from './helpers/images'

function jpegWithBigApp(w: number, h: number): Buffer {
  const sof = jpegHeader(w, h).subarray(8) // SOF0 onward
  const seg = (marker: number, size: number) => {
    const b = Buffer.alloc(2 + size)
    b.set([0xff, marker], 0)
    b.writeUInt16BE(size, 2)
    return b
  }
  return Buffer.concat([Buffer.from([0xff, 0xd8]), seg(0xe1, 65_535), seg(0xe2, 8_000), sof])
}

const write = (b: Buffer) => {
  const p = join(mkdtempSync(join(tmpdir(), 'diwan-av-')), 'a.jpg')
  writeFileSync(p, b)
  return p
}

test('photo JPEG with SOF after 70 KB of metadata is accepted at 4000x3000', () => {
  expect(avatarFileOk(write(jpegWithBigApp(4000, 3000)))).toBe(true)
})
test('8000x6000 is rejected', () => {
  expect(avatarFileOk(write(jpegWithBigApp(8000, 6000)))).toBe(false)
})
test('a directory is rejected', () => {
  expect(avatarFileOk(mkdtempSync(join(tmpdir(), 'diwan-av-')))).toBe(false)
})
