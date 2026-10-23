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

describe('sanitizeFilename on Windows-unsafe names', () => {
  test.each([
    ['a<b>c:d"e|f?g*h.txt', 'a_b_c_d_e_f_g_h.txt'],
    ['report: final?.pdf', 'report_ final_.pdf'],
    ['CON', 'CON_'],
    ['con.txt', 'con_.txt'],
    ['Nul.tar.gz', 'Nul_.tar.gz'],
    ['prn.', 'prn_'],
    ['aux.pdf', 'aux_.pdf'],
    ['COM1.log', 'COM1_.log'],
    ['lpt9', 'lpt9_'],
    ['COM0.txt', 'COM0.txt'],
    ['COM10.txt', 'COM10.txt'],
    ['console.txt', 'console.txt'],
    ['my con.txt', 'my con.txt'],
    ['CONIN$', 'CONIN$_'],
    ['conout$.txt', 'conout$_.txt'],
    ['COM¹', 'COM¹_'],
    ['lpt³.log', 'lpt³_.log'],
    ['COM⁴.txt', 'COM⁴.txt'],
    ['CONIN.txt', 'CONIN.txt'],
  ])('%s → %s', (input, out) => expect(sanitizeFilename(input)).toBe(out))

  test('truncation never leaves a trailing dot or space for Windows to drop', () => {
    const spaced = sanitizeFilename(`${'a'.repeat(246)} ${'b'.repeat(20)}`)
    expect(spaced).toBe('a'.repeat(246))
    // the long tail after the dot is no extension, so it is cut like the rest of the base
    const dotted = sanitizeFilename(`${'a'.repeat(246)}.${'b'.repeat(30)}`)
    expect(dotted).toBe('a'.repeat(246))
    const withExt = sanitizeFilename(`${'a'.repeat(240)}  .  ${'b'.repeat(20)}.pdf`)
    expect(withExt).toMatch(/^a+\.pdf$/)
    expect(Buffer.byteLength(withExt, 'utf8')).toBeLessThanOrEqual(255)
  })

  test('a long reserved-looking name still fits in 255 bytes', () => {
    const clean = sanitizeFilename(`con.${'x'.repeat(300)}`)
    expect(Buffer.byteLength(clean, 'utf8')).toBeLessThanOrEqual(255)
  })
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
