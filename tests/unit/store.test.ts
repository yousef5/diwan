import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, test } from 'vitest'
import { Store } from '../../src/main/store/store'

const id = '649d14d5-ebb9-4ed6-9725-633b89c6ceac'
const account = {
  id,
  name: 'Work',
  color: '#14b8a6',
  order: 0,
  zoom: 0,
  muted: false,
  customAvatar: false,
  createdAt: 'x',
}
let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'diwan-store-'))
})

const read = (name: string) => JSON.parse(readFileSync(join(dir, name), 'utf8'))

describe('Store', () => {
  test('first run: defaults, nothing written until a change', () => {
    const s = new Store(dir, 0)
    expect(s.source).toBe('default')
    expect(s.recovery).toBe(false)
    expect(existsSync(join(dir, 'diwan.json'))).toBe(false)
  })

  test('update writes atomically and keeps the previous good file as .bak', () => {
    const s = new Store(dir, 0)
    s.update((f) => {
      f.accounts.push(account)
    })
    expect(read('diwan.json').accounts).toHaveLength(1)
    expect(existsSync(join(dir, 'diwan.json.bak'))).toBe(false)
    s.update((f) => {
      f.accounts[0].name = 'Work 2'
    })
    expect(read('diwan.json').accounts[0].name).toBe('Work 2')
    expect(read('diwan.json.bak').accounts[0].name).toBe('Work')
    expect(readdirSync(dir).filter((n) => n.endsWith('.tmp'))).toEqual([])
  })

  test('an invalid mutation throws and changes nothing', () => {
    const s = new Store(dir, 0)
    s.update((f) => {
      f.accounts.push(account)
    })
    expect(() =>
      s.update((f) => {
        f.accounts[0].id = 'not-a-uuid'
      }),
    ).toThrow()
    expect(s.get().accounts[0].id).toBe(id)
  })

  test('corrupt main file → loads .bak, and never overwrites the good .bak', () => {
    const s = new Store(dir, 0)
    s.update((f) => {
      f.accounts.push(account)
    })
    s.update((f) => {
      f.accounts[0].name = 'Second'
    })
    writeFileSync(join(dir, 'diwan.json'), '{ half-writ')
    const s2 = new Store(dir, 0)
    expect(s2.source).toBe('backup')
    expect(s2.get().accounts[0].name).toBe('Work')
    s2.update((f) => {
      f.accounts[0].name = 'Third'
    })
    expect(read('diwan.json').accounts[0].name).toBe('Third')
    expect(read('diwan.json.bak').accounts[0].name).toBe('Work')
  })

  test('both files bad → recovery mode: read-only, files untouched', () => {
    writeFileSync(join(dir, 'diwan.json'), 'garbage')
    writeFileSync(join(dir, 'diwan.json.bak'), 'garbage too')
    const s = new Store(dir, 0)
    expect(s.recovery).toBe(true)
    expect(s.get().accounts).toEqual([])
    expect(() =>
      s.update((f) => {
        f.importedFromNexus = true
      }),
    ).toThrow('recovery')
    s.flush()
    expect(readFileSync(join(dir, 'diwan.json'), 'utf8')).toBe('garbage')
  })

  test('a file from a newer Diwan → recovery, not a downgrade', () => {
    writeFileSync(join(dir, 'diwan.json'), JSON.stringify({ schemaVersion: 99 }))
    expect(new Store(dir, 0).recovery).toBe(true)
  })

  test('newer main file + valid old .bak → still recovery, never falls back to the .bak', () => {
    writeFileSync(join(dir, 'diwan.json'), JSON.stringify({ schemaVersion: 99, accounts: [] }))
    writeFileSync(join(dir, 'diwan.json.bak'), JSON.stringify({ schemaVersion: 1, accounts: [account] }))
    const s = new Store(dir, 0)
    expect(s.recovery).toBe(true)
    s.flush()
    expect(read('diwan.json').schemaVersion).toBe(99)
  })

  test('startFresh moves broken files aside and leaves recovery', () => {
    writeFileSync(join(dir, 'diwan.json'), 'garbage')
    const s = new Store(dir, 0)
    s.startFresh()
    expect(s.recovery).toBe(false)
    expect(read('diwan.json').accounts).toEqual([])
    expect(readdirSync(dir).some((n) => n.startsWith('diwan.json.broken-'))).toBe(true)
  })

  test('debounced writes coalesce until flush', () => {
    const s = new Store(dir, 10_000)
    s.update((f) => {
      f.importedFromNexus = true
    })
    expect(existsSync(join(dir, 'diwan.json'))).toBe(false)
    s.flush()
    expect(read('diwan.json').importedFromNexus).toBe(true)
  })
})
