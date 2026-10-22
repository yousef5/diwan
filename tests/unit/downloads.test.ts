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
