import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
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

  const second = { ...account, id: '11111111-2222-4333-8444-555555555555', name: 'Home', order: 1 }
  const shortWrite = (state: { on: boolean }) => ({
    writeFileSync: ((f: string, data: string, opts: never) => {
      writeFileSync(f, state.on ? data.slice(0, Math.floor(data.length / 2)) : data, opts)
    }) as never,
  })

  test('a short write never poisons main or .bak, and the next save works', () => {
    const state = { on: false }
    const s = new Store(dir, 0, undefined, shortWrite(state))
    s.update((f) => {
      f.accounts.push(account)
    })
    state.on = true
    expect(() =>
      s.update((f) => {
        f.accounts.push(second)
      }),
    ).toThrow()
    expect(read('diwan.json').accounts).toHaveLength(1)
    state.on = false
    s.update((f) => {
      f.accounts[0].name = 'After'
    })
    expect(read('diwan.json').accounts).toHaveLength(2)
    expect(() => read('diwan.json.bak')).not.toThrow()
    state.on = true
    expect(() =>
      s.update((f) => {
        f.accounts[0].name = 'y'
      }),
    ).toThrow()
    expect(read('diwan.json').accounts).toHaveLength(2)
    expect(read('diwan.json.bak').accounts).toHaveLength(1)
  })

  test('read-only directory: update throws, data stays in memory, retry works', () => {
    if (process.getuid?.() === 0) return
    const s = new Store(dir, 0)
    s.update((f) => {
      f.accounts.push(account)
    })
    chmodSync(dir, 0o500)
    try {
      expect(() =>
        s.update((f) => {
          f.accounts[0].name = 'Held'
        }),
      ).toThrow()
      expect(s.get().accounts[0].name).toBe('Held')
    } finally {
      chmodSync(dir, 0o700)
    }
    s.flush()
    expect(read('diwan.json').accounts[0].name).toBe('Held')
  })

  test('flush() failure keeps the change for the next flush', () => {
    const fail = { on: true }
    const s = new Store(dir, 10_000, undefined, {
      writeFileSync: ((f: string, d: string, o: never) => {
        if (fail.on) throw new Error('ENOSPC')
        writeFileSync(f, d, o)
      }) as never,
    })
    s.update((f) => {
      f.importedFromNexus = true
    })
    expect(() => s.flush()).toThrow('ENOSPC')
    fail.on = false
    s.flush()
    expect(read('diwan.json').importedFromNexus).toBe(true)
  })

  describe('timers', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    test('timer write failure goes to onError and is retried with backoff', () => {
      const fail = { on: true }
      const errors: unknown[] = []
      const s = new Store(dir, 100, (e) => errors.push(e), {
        writeFileSync: ((f: string, d: string, o: never) => {
          if (fail.on) throw new Error('ENOSPC')
          writeFileSync(f, d, o)
        }) as never,
      })
      s.update((f) => {
        f.importedFromNexus = true
      })
      vi.advanceTimersByTime(100)
      expect(errors).toHaveLength(1)
      vi.advanceTimersByTime(1000)
      expect(errors).toHaveLength(2)
      fail.on = false
      vi.advanceTimersByTime(2000)
      expect(read('diwan.json').importedFromNexus).toBe(true)
      expect(errors).toHaveLength(2)
    })

    test('5 updates inside the window cause one write', () => {
      let renames = 0
      const s = new Store(dir, 100, undefined, {
        renameSync: ((a: string, b: string) => {
          renames++
          renameSync(a, b)
        }) as never,
      })
      for (let i = 0; i < 5; i++)
        s.update((f) => {
          f.settings.closeToTray = i % 2 === 0
        })
      vi.advanceTimersByTime(100)
      expect(renames).toBe(1)
    })
  })

  test('loading from .bak preserves the damaged main as diwan.json.broken-*', () => {
    const s = new Store(dir, 0)
    s.update((f) => {
      f.accounts.push(account)
    })
    s.update((f) => {
      f.accounts[0].name = 'Second'
    })
    writeFileSync(join(dir, 'diwan.json'), '{ half-writ')
    new Store(dir, 0)
    const broken = readdirSync(dir).filter((n) => n.startsWith('diwan.json.broken-'))
    expect(broken).toHaveLength(1)
    expect(readFileSync(join(dir, broken[0]), 'utf8')).toBe('{ half-writ')
  })

  test('recovery leaves .bak bytes untouched too', () => {
    writeFileSync(join(dir, 'diwan.json'), 'garbage')
    writeFileSync(join(dir, 'diwan.json.bak'), 'garbage too')
    const s = new Store(dir, 0)
    s.flush()
    expect(readFileSync(join(dir, 'diwan.json.bak'), 'utf8')).toBe('garbage too')
  })

  test('startFresh throws outside recovery; in recovery it moves both files aside', () => {
    expect(() => new Store(dir, 0).startFresh()).toThrow('recovery')
    writeFileSync(join(dir, 'diwan.json'), 'garbage')
    writeFileSync(join(dir, 'diwan.json.bak'), 'garbage too')
    const s = new Store(dir, 0)
    s.startFresh()
    const names = readdirSync(dir)
    expect(names.some((n) => n.startsWith('diwan.json.broken-'))).toBe(true)
    expect(names.some((n) => n.startsWith('diwan.json.bak.broken-'))).toBe(true)
    expect(read('diwan.json').accounts).toEqual([])
  })

  test('a stale .tmp is ignored and the next save works', () => {
    writeFileSync(join(dir, 'diwan.json.tmp'), '{ stale')
    const s = new Store(dir, 0)
    expect(s.recovery).toBe(false)
    s.update((f) => {
      f.accounts.push(account)
    })
    expect(read('diwan.json').accounts).toHaveLength(1)
  })

  test('a throwing mutator leaves state and disk unchanged', () => {
    const s = new Store(dir, 0)
    s.update((f) => {
      f.accounts.push(account)
    })
    const before = readFileSync(join(dir, 'diwan.json'), 'utf8')
    expect(() =>
      s.update((f) => {
        f.accounts[0].name = 'Half'
        throw new Error('boom')
      }),
    ).toThrow('boom')
    expect(s.get().accounts[0].name).toBe('Work')
    expect(readFileSync(join(dir, 'diwan.json'), 'utf8')).toBe(before)
  })

  test('mutating get() output throws and leaves the store unchanged', () => {
    const s = new Store(dir, 0)
    s.update((f) => {
      f.accounts.push(account)
    })
    const view = s.get() as unknown as { accounts: { name: string }[] }
    expect(() => {
      view.accounts[0].name = 'Evil'
    }).toThrow()
    expect(() => {
      view.accounts.push({ name: 'x' })
    }).toThrow()
    expect(s.get().accounts[0].name).toBe('Work')
  })

  test('the saved file is mode 0600', () => {
    const s = new Store(dir, 0)
    s.update((f) => {
      f.accounts.push(account)
    })
    expect(statSync(join(dir, 'diwan.json')).mode & 0o777).toBe(0o600)
  })
})
