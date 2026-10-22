import {
  existsSync,
  linkSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { finalizeDownload, sanitizeFilename } from '../../src/main/downloads'

const fs = { linkSync, unlinkSync, existsSync }

test('target appearing mid-download gets (1), nothing overwritten, stage removed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'diwan-dl-'))
  const stage = join(dir, '.diwan-x.part')
  writeFileSync(stage, 'new')
  writeFileSync(join(dir, 'a.txt'), 'old')
  const out = finalizeDownload(stage, dir, 'a.txt', fs)
  expect(out).toBe(join(dir, 'a (1).txt'))
  expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('old')
  expect(readFileSync(join(dir, 'a (1).txt'), 'utf8')).toBe('new')
  expect(readdirSync(dir).sort()).toEqual(['a (1).txt', 'a.txt'])
})

test('EEXIST race on link retries with next name; stage removed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'diwan-dl-'))
  const stage = join(dir, '.s.part')
  writeFileSync(stage, 'n')
  let first = true
  const racy = {
    ...fs,
    linkSync: (a: string, b: string) => {
      if (first) {
        first = false
        writeFileSync(b, 'raced')
      }
      linkSync(a, b)
    },
  }
  expect(finalizeDownload(stage, dir, 'b.txt', racy)).toBe(join(dir, 'b (1).txt'))
  expect(readFileSync(join(dir, 'b.txt'), 'utf8')).toBe('raced')
  expect(existsSync(stage)).toBe(false)
})

test('sanitizeFilename replaces U+2028/U+2029', () => {
  expect(sanitizeFilename('a b c.txt')).toBe('a_b_c.txt')
})
