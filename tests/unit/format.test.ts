import { describe, expect, test } from 'vitest'
import { cleanError, formatBytes, initials } from '../../src/renderer/format'

describe('format', () => {
  test('initials', () => {
    expect(initials('Pharmacy')).toBe('PH')
    expect(initials('SAP study')).toBe('SS')
    expect(initials('  محمد يوسف ')).toBe('مي')
    expect(initials('')).toBe('?')
    expect(initials('   ')).toBe('?')
  })

  test('initials never split a surrogate pair', () => {
    expect(initials('😀 smile')).toBe('😀S')
    expect(initials('𝒜b')).toBe('𝒜B')
  })

  test('initials keep whole graphemes: Arabic harakat, ZWJ emoji, flags', () => {
    expect(initials('محمد')).toBe('مح')
    expect(initials('مُحمد')).toBe('مُح')
    expect(initials('صيدلية الشفاء')).toBe('صش')
    expect(initials('👨‍👩‍👧 home')).toBe('👨‍👩‍👧H')
    expect(initials('🇪🇬🇸🇦')).toBe('🇪🇬🇸🇦')
  })

  test('initials skip the Arabic definite article', () => {
    expect(initials('العائلة')).toBe('عا')
    expect(initials('الشركة')).toBe('شر')
    expect(initials('الْعائلة')).toBe('عا') // sukun on the lam
    expect(initials('عبد الرحمن')).toBe('عر')
    expect(initials('عبد الله')).toBe('عل')
    expect(initials('العائلة الكبيرة')).toBe('عك')
    // Not an article: the word is only "ال", or doesn't start with a bare alef + lam.
    expect(initials('ال')).toBe('ال')
    expect(initials('الف')).toBe('ال')
    expect(initials('ال بيت')).toBe('اب')
    expect(initials('إلهام')).toBe('إل')
    expect(initials('Alex')).toBe('AL')
  })

  test('formatBytes', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1023)).toBe('1023 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(108 * 1024 * 1024)).toBe('108 MB')
    expect(formatBytes(1.7 * 1024 ** 3)).toBe('1.7 GB')
    expect(formatBytes(3 * 1024 ** 5)).toBe('3072 TB')
  })

  test('formatBytes treats junk as zero', () => {
    expect(formatBytes(-5)).toBe('0 B')
    expect(formatBytes(Number.NaN)).toBe('0 B')
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe('0 B')
  })

  test('cleanError strips Electron’s IPC prefix', () => {
    expect(
      cleanError(
        new Error(
          "Error invoking remote method 'importer:apply': Error: Quit Nexus first, then import again.",
        ),
      ),
    ).toBe('Quit Nexus first, then import again.')
    expect(cleanError(new Error("Error invoking remote method 'account:add': TypeError: bad"))).toBe(
      'TypeError: bad',
    )
    expect(cleanError('plain')).toBe('plain')
    expect(cleanError(new Error('no prefix'))).toBe('no prefix')
  })

  test('cleanError never returns an empty string', () => {
    expect(cleanError(new Error(''))).toBe('Something went wrong.')
    expect(cleanError(undefined)).toBe('Something went wrong.')
    expect(cleanError(new Error("Error invoking remote method 'x:y': Error: "))).toBe('Something went wrong.')
  })
})
