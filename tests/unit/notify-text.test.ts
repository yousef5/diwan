import { expect, test } from 'vitest'
import { escapeNotifyText } from '../../src/main/notify-text'

test('escapes markup on linux, unchanged elsewhere', () => {
  const orig = process.platform
  Object.defineProperty(process, 'platform', { value: 'linux' })
  expect(escapeNotifyText('<b>a&b</b>')).toBe('&lt;b&gt;a&amp;b&lt;/b&gt;')
  Object.defineProperty(process, 'platform', { value: 'darwin' })
  expect(escapeNotifyText('<b>a&b</b>')).toBe('<b>a&b</b>')
  Object.defineProperty(process, 'platform', { value: orig })
})
