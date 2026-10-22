import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { orphanPartitions, orphanSweepAllowed, sweepOrphanPartitions } from '../../src/main/orphan-partitions'

const A = '0f3c2b1a-1111-4222-8333-944455556666'
const B = '7d8e9f00-aaaa-4bbb-8ccc-ddddeeeeffff'
const GONE = '12345678-9abc-4def-8123-456789abcdef'

describe('orphanPartitions', () => {
  test('picks only acc-<uuid> names that belong to no account', () => {
    expect(orphanPartitions([`acc-${A}`, `acc-${GONE}`, `acc-${B}`], [A, B])).toEqual([`acc-${GONE}`])
  })

  test('with no accounts, every account folder is an orphan', () => {
    expect(orphanPartitions([`acc-${A}`, `acc-${B}`], [])).toEqual([`acc-${A}`, `acc-${B}`])
  })

  test('never picks import leftovers, which sweepPartials owns', () => {
    expect(orphanPartitions([`acc-${GONE}.partial`], [])).toEqual([])
  })

  test('never picks anything that is not exactly acc-<lowercase uuid>', () => {
    const names = [
      'acc-',
      'acc-x',
      `acc-${GONE.toUpperCase()}`,
      `ACC-${GONE}`,
      `acc-${GONE}x`,
      `xacc-${GONE}`,
      `acc-${GONE}/..`,
      `acc-${GONE.replaceAll('-', '')}`,
      `acc-${GONE} `,
      `acc-${GONE}\n`,
      GONE,
      'Default',
      'Partitions',
      '.',
      '..',
    ]
    expect(orphanPartitions(names, [])).toEqual([])
  })
})

describe('orphanSweepAllowed', () => {
  test('only when the account list came from the settings file itself', () => {
    expect(orphanSweepAllowed({ recovery: false, source: 'file' })).toBe(true)
    expect(orphanSweepAllowed({ recovery: true, source: 'default' })).toBe(false) // damaged file
    expect(orphanSweepAllowed({ recovery: false, source: 'backup' })).toBe(false) // .bak may miss new accounts
    expect(orphanSweepAllowed({ recovery: false, source: 'default' })).toBe(false) // no file at all
  })
})

describe('sweepOrphanPartitions', () => {
  const dirs: string[] = []
  const tmp = () => {
    const d = mkdtempSync(join(tmpdir(), 'diwan-orphans-'))
    dirs.push(d)
    return d
  }
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
  })

  test('removes orphan account folders and keeps everything else', async () => {
    const parts = tmp()
    for (const n of [`acc-${A}`, `acc-${GONE}`, `acc-${B}.partial`, 'other'])
      mkdirSync(join(parts, n, 'Local Storage'), { recursive: true })
    const removed = await sweepOrphanPartitions(parts, [A])
    expect(removed).toEqual([`acc-${GONE}`])
    expect(existsSync(join(parts, `acc-${GONE}`))).toBe(false)
    expect(existsSync(join(parts, `acc-${A}`, 'Local Storage'))).toBe(true)
    expect(existsSync(join(parts, `acc-${B}.partial`))).toBe(true)
    expect(existsSync(join(parts, 'other'))).toBe(true)
  })

  test('never follows a symlink, and leaves plain files alone', async () => {
    const parts = tmp()
    const elsewhere = tmp()
    writeFileSync(join(elsewhere, 'precious'), 'x')
    symlinkSync(elsewhere, join(parts, `acc-${GONE}`))
    writeFileSync(join(parts, `acc-${B}`), 'not a folder')
    const removed = await sweepOrphanPartitions(parts, [])
    expect(removed).toEqual([])
    expect(existsSync(join(elsewhere, 'precious'))).toBe(true)
    expect(existsSync(join(parts, `acc-${GONE}`))).toBe(true)
    expect(existsSync(join(parts, `acc-${B}`))).toBe(true)
  })

  test('a missing Partitions folder is not an error', async () => {
    await expect(sweepOrphanPartitions(join(tmp(), 'missing'), [])).resolves.toEqual([])
  })
})
