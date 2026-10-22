import {
  copyFileSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import {
  finalizeDownload,
  lstatExists,
  sanitizeFilename,
  sweepStaleDownloadParts,
} from '../../src/main/downloads'

const fs = { linkSync, unlinkSync, copyFileSync, exists: lstatExists }
const eperm = () => Object.assign(new Error('perm'), { code: 'EPERM' })

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

test('link EPERM falls back to copy; file kept under final name, stage removed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'diwan-dl-'))
  const stage = join(dir, '.s.part')
  writeFileSync(stage, 'data')
  const noLink = {
    ...fs,
    linkSync: () => {
      throw eperm()
    },
  }
  expect(finalizeDownload(stage, dir, 'c.txt', noLink)).toBe(join(dir, 'c.txt'))
  expect(readFileSync(join(dir, 'c.txt'), 'utf8')).toBe('data')
  expect(existsSync(stage)).toBe(false)
})

test('dangling symlink at wanted name is untouched; saved as (1)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'diwan-dl-'))
  const stage = join(dir, '.s.part')
  writeFileSync(stage, 'data')
  symlinkSync(join(dir, 'nowhere'), join(dir, 'a.txt'))
  expect(finalizeDownload(stage, dir, 'a.txt', fs)).toBe(join(dir, 'a (1).txt'))
  expect(readlinkSync(join(dir, 'a.txt'))).toBe(join(dir, 'nowhere'))
  expect(existsSync(join(dir, 'nowhere'))).toBe(false)
})

test('everything failing returns null and keeps the stage file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'diwan-dl-'))
  const stage = join(dir, '.s.part')
  writeFileSync(stage, 'data')
  const errors: string[] = []
  const broken = {
    ...fs,
    linkSync: () => {
      throw eperm()
    },
    copyFileSync: () => {
      throw eperm()
    },
  }
  expect(finalizeDownload(stage, dir, 'd.txt', broken, (m) => errors.push(m))).toBeNull()
  expect(readFileSync(stage, 'utf8')).toBe('data')
  expect(errors.length).toBeGreaterThan(0)
})

test('always-EEXIST exhausts attempts, returns null, keeps stage', () => {
  const dir = mkdtempSync(join(tmpdir(), 'diwan-dl-'))
  const stage = join(dir, '.s.part')
  writeFileSync(stage, 'data')
  const eexist = () => {
    throw Object.assign(new Error('x'), { code: 'EEXIST' })
  }
  const broken = { ...fs, exists: () => false, linkSync: eexist, copyFileSync: eexist }
  expect(finalizeDownload(stage, dir, 'e.txt', broken)).toBeNull()
  expect(existsSync(stage)).toBe(true)
})

test('sweepStaleDownloadParts removes only old regular .diwan parts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'diwan-dl-'))
  const old = Date.now() / 1000 - 3 * 86_400
  for (const n of ['.diwan-a.part', '.diwan-a.part.crdownload', 'keep.txt', '.diwan-fresh.part']) {
    writeFileSync(join(dir, n), 'x')
  }
  for (const n of ['.diwan-a.part', '.diwan-a.part.crdownload', 'keep.txt'])
    utimesSync(join(dir, n), old, old)
  symlinkSync(join(dir, 'keep.txt'), join(dir, '.diwan-link.part'))
  utimesSync(join(dir, '.diwan-link.part'), old, old)
  sweepStaleDownloadParts(dir)
  expect(readdirSync(dir).sort()).toEqual(['.diwan-fresh.part', '.diwan-link.part', 'keep.txt'])
  expect(lstatSync(join(dir, '.diwan-link.part')).isSymbolicLink()).toBe(true)
})
