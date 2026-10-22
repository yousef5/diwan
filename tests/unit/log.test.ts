import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { createLogger } from '../../src/main/log'

test('writes lines and rotates at the size limit, keeping 3 old files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'diwan-log-'))
  const log = createLogger(dir, { maxBytes: 200, echo: false })
  log.info('hello', { a: 1 })
  expect(readFileSync(join(dir, 'main.log'), 'utf8')).toMatch(/ info hello {"a":1}\n$/)
  for (let i = 0; i < 40; i++) log.warn(`line ${i} ${'x'.repeat(30)}`)
  expect(existsSync(join(dir, 'main.log.1'))).toBe(true)
  expect(existsSync(join(dir, 'main.log.3'))).toBe(true)
  expect(existsSync(join(dir, 'main.log.4'))).toBe(false)
})

test('never throws when logging odd values', () => {
  const dir = mkdtempSync(join(tmpdir(), 'diwan-log-'))
  const log = createLogger(dir, { echo: false })
  writeFileSync(join(dir, 'main.log'), '')
  expect(() => log.error('boom', new Error('x'))).not.toThrow()
})
