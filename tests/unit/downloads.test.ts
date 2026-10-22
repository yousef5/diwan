import { basename, dirname } from 'node:path'
import { describe, expect, test } from 'vitest'
import { sanitizeFilename, uniquePath } from '../../src/main/downloads'

describe('sanitizeFilename', () => {
  test.each([
    ['invoice.pdf', 'invoice.pdf'],
    ['../../etc/passwd', '_.._etc_passwd'],
    ['.hidden', 'hidden'],
    ['', 'download'],
    ['a\0b.txt', 'a_b.txt'],
    ['صورة.jpg', 'صورة.jpg'],
  ])('%s', (input, out) => expect(sanitizeFilename(input)).toBe(out))
})

describe('uniquePath', () => {
  test('free name is kept', () => {
    expect(uniquePath('/d', 'a.pdf', () => false)).toBe('/d/a.pdf')
  })
  test('taken names get (1), (2)…', () => {
    const taken = new Set(['/d/a.pdf', '/d/a (1).pdf'])
    expect(uniquePath('/d', 'a.pdf', (p) => taken.has(p))).toBe('/d/a (2).pdf')
  })
  test('no extension', () => {
    expect(uniquePath('/d', 'README', (p) => p === '/d/README')).toBe('/d/README (1)')
  })
})

const bytes = (s: string) => Buffer.byteLength(s, 'utf8')

describe('hostile names', () => {
  test.each([
    ' ..',
    ' .',
    '\t..',
    ' .bashrc',
    '...',
    '. . .',
    'a\nb.txt',
    'invoice\u202Egpj.exe',
    '\u2066x\u2069.pdf',
    'x.pdf.',
    '../../etc/passwd',
    '..\\..\\win',
  ])('%j stays inside the folder', (input) => {
    const out = uniquePath('/d', input, () => false)
    const name = basename(out)
    expect(dirname(out)).toBe('/d')
    expect(name).not.toBe('.')
    expect(name).not.toBe('..')
    expect(name.startsWith('.')).toBe(false)
    expect(/[\p{Cc}\p{Cf}]/u.test(name)).toBe(false)
  })
  test('plan example is still safe', () => {
    expect(sanitizeFilename(' ..')).toBe('download')
    expect(sanitizeFilename('x.pdf.')).toBe('x.pdf')
  })
})

describe('byte-safe length', () => {
  test('long Arabic name keeps .pdf within 255 bytes, also with a suffix', () => {
    const long = `${'ص'.repeat(254)}.pdf`
    const clean = sanitizeFilename(long)
    expect(bytes(clean)).toBeLessThanOrEqual(255)
    expect(clean.endsWith('.pdf')).toBe(true)
    const taken = new Set([`/d/${clean}`])
    const out = basename(uniquePath('/d', long, (p) => taken.has(p)))
    expect(bytes(out)).toBeLessThanOrEqual(255)
    expect(out.endsWith(' (1).pdf')).toBe(true)
  })
  test('emoji is never split', () => {
    const clean = sanitizeFilename(`${'😀'.repeat(200)}.jpg`)
    expect(Buffer.from(clean, 'utf8').toString('utf8')).toBe(clean)
    expect(bytes(clean)).toBeLessThanOrEqual(255)
    expect(clean.endsWith('.jpg')).toBe(true)
  })
  test('Arabic name unchanged', () => {
    expect(sanitizeFilename('صورة.jpg')).toBe('صورة.jpg')
  })
  test('loop is capped and falls back to a timestamp', () => {
    const out = basename(uniquePath('/d', 'a.pdf', () => true))
    expect(out).toMatch(/^a \(\d{13}\)\.pdf$/)
  })
  test('timestamp fallback of a max-length name still fits', () => {
    const out = basename(uniquePath('/d', `${'ص'.repeat(254)}.pdf`, () => true))
    expect(bytes(out)).toBeLessThanOrEqual(255)
  })
})
