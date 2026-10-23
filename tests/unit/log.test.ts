import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { createLogger } from '../../src/main/log'
import { isWindows } from './helpers/platform'

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

test('rotation works the same with the Windows retry path', () => {
  const dir = mkdtempSync(join(tmpdir(), 'diwan-log-'))
  const log = createLogger(dir, { maxBytes: 200, echo: false, platform: 'win32' })
  for (let i = 0; i < 40; i++) log.warn(`line ${i} ${'x'.repeat(30)}`)
  expect(existsSync(join(dir, 'main.log.1'))).toBe(true)
  expect(existsSync(join(dir, 'main.log.4'))).toBe(false)
})

test('never throws when logging odd values', () => {
  const dir = mkdtempSync(join(tmpdir(), 'diwan-log-'))
  const log = createLogger(dir, { echo: false })
  writeFileSync(join(dir, 'main.log'), '')
  expect(() => log.error('boom', new Error('x'))).not.toThrow()
})

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'diwan-log-'))
  return {
    dir,
    log: createLogger(dir, { echo: false }),
    read: () => readFileSync(join(dir, 'main.log'), 'utf8'),
  }
}

test('ZodError-like extras log only path and code, never the message', () => {
  const { log, read } = setup()
  log.error('bad', {
    name: 'ZodError',
    message: 'secret chat text',
    issues: [{ path: ['body'], code: 'too_big' }],
  })
  expect(read()).toContain('ZodError: body:too_big')
  expect(read()).not.toContain('secret')
})

test('long error messages are cut to 200 characters', () => {
  const { log, read } = setup()
  log.error('bad', new Error('y'.repeat(500)))
  expect(read()).toContain('y'.repeat(200))
  expect(read()).not.toContain('y'.repeat(201))
})

test('control characters in error messages become spaces', () => {
  const { log, read } = setup()
  log.error('bad', new Error('a\nb'))
  expect(read()).toContain('Error: a b\n')
})

test('error cause shows its name but never its message', () => {
  const { log, read } = setup()
  log.error('bad', new Error('outer', { cause: new TypeError('hidden text') }))
  expect(read()).toContain('(cause: TypeError)')
  expect(read()).not.toContain('hidden')
})

test('circular and BigInt extras log [unserialisable]', () => {
  const { log, read } = setup()
  const a: Record<string, unknown> = {}
  a.self = a
  log.info('circ', a)
  log.info('big', { n: 1n })
  const lines = read().trim().split('\n')
  expect(lines[0]).toMatch(/\[unserialisable\]$/)
  expect(lines[1]).toMatch(/\[unserialisable\]$/)
})

test('plain object output is cut to 500 characters', () => {
  const { log, read } = setup()
  log.info('long', { v: 'z'.repeat(2000) })
  expect(read()).not.toContain('z'.repeat(501))
})

test('does not throw when the dir is a regular file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'diwan-log-'))
  const f = join(dir, 'file')
  writeFileSync(f, '')
  const log = createLogger(f, { echo: false })
  expect(() => log.info('x')).not.toThrow()
})

test.skipIf(isWindows)('log file is private (0600)', () => {
  const { dir, log } = setup()
  log.info('x')
  expect(statSync(join(dir, 'main.log')).mode & 0o777).toBe(0o600)
})

test('errors carry up to 8 stack frames, each on its own line', () => {
  const { log, read } = setup()
  const e = new Error('z'.repeat(500))
  e.stack = [
    `Error: ${e.message}`,
    ...Array.from({ length: 12 }, (_, i) => `    at fn${i} (/app/main.js:${i}:1)`),
  ].join('\n')
  log.error('bad', e)
  const text = read()
  expect(text).toContain('\n    at fn0 (/app/main.js:0:1)')
  expect(text).toContain('\n    at fn7 (/app/main.js:7:1)')
  expect(text).not.toContain('fn8')
  expect(text).toContain('z'.repeat(200))
  expect(text).not.toContain('z'.repeat(201))
})

test('a real error logs its own frames', () => {
  const { log, read } = setup()
  log.error('bad', new Error('short'))
  expect(read()).toMatch(/Error: short\n {4}at .+log\.test\.ts:\d+:\d+/)
})

test('message lines that look like frames are never logged as frames', () => {
  const { log, read } = setup()
  log.error('bad', new Error('hello\n    at secret chat text'))
  expect(read()).not.toContain('\n    at secret')
})

test('frames are capped at 200 characters and lose control characters', () => {
  const { log, read } = setup()
  const e = new Error('x')
  e.stack = `Error: x\n    at ${'f'.repeat(400)}\u0007`
  log.error('bad', e)
  const frame = read().split('\n')[1]
  expect(frame).toBe(`    at ${'f'.repeat(197)}`)
})

test('a stack whose header does not match name and message logs no frames at all', () => {
  const { log, read } = setup()
  const e = new Error('hello\n    at secret chat text')
  // e.g. a stack rewritten by a library: the message can't be cut off safely, so nothing is scanned
  e.stack = 'Wrapped: hello\n    at secret chat text\n    at fn (/app/main.js:1:1)'
  log.error('bad', e)
  const text = read()
  expect(text).not.toContain('\n    at secret')
  expect(text.trimEnd().split('\n')).toHaveLength(1) // the (flattened) message, and no frames
})
