import { describe, expect, test } from 'vitest'
import { migrate } from '../../src/main/store/migrate'
import { DEFAULT_SETTINGS, defaultFile, parseDiwanFile, SCHEMA_VERSION } from '../../src/main/store/schema'

const id1 = '649d14d5-ebb9-4ed6-9725-633b89c6ceac'
const id2 = '7c5ac4b8-1433-4f78-b073-87dec6c0bd3e'

describe('parseDiwanFile', () => {
  test('defaults for an empty file', () => {
    const f = defaultFile()
    expect(f).toEqual({
      schemaVersion: SCHEMA_VERSION,
      importedFromNexus: false,
      accounts: [],
      settings: DEFAULT_SETTINGS,
      pendingFolderRemovals: [],
    })
  })

  test('fills missing nested settings and drops unknown keys', () => {
    const f = parseDiwanFile({
      schemaVersion: 1,
      accounts: [],
      junk: 1,
      settings: { closeToTray: false, notifications: { sound: false } },
    })
    expect(f.settings.closeToTray).toBe(false)
    expect(f.settings.notifications).toEqual({ ...DEFAULT_SETTINGS.notifications, sound: false })
    expect('junk' in f).toBe(false)
  })

  test('account defaults, sorting by order and re-indexing', () => {
    const f = parseDiwanFile({
      schemaVersion: 1,
      accounts: [
        { id: id1, name: 'B', color: '#3b82f6', order: 5 },
        { id: id2, name: 'A', color: '#14b8a6', order: 2 },
      ],
    })
    expect(f.accounts.map((a) => [a.name, a.order])).toEqual([
      ['A', 0],
      ['B', 1],
    ])
    expect(f.accounts[0]).toMatchObject({ zoom: 0, muted: false, customAvatar: false })
  })

  test('drops duplicate ids', () => {
    const a = { id: id1, name: 'A', color: '#3b82f6', order: 0 }
    expect(parseDiwanFile({ schemaVersion: 1, accounts: [a, { ...a, name: 'dup' }] }).accounts).toHaveLength(
      1,
    )
  })

  test('rejects bad data', () => {
    expect(() =>
      parseDiwanFile({ schemaVersion: 1, accounts: [{ id: 'x', name: '', color: 'red', order: 0 }] }),
    ).toThrow()
    expect(() => parseDiwanFile('nope')).toThrow()
  })

  test('default objects are not shared between files', () => {
    const a = defaultFile()
    a.settings.notifications.enabled = false
    expect(defaultFile().settings.notifications.enabled).toBe(true)
  })
  test('accounts is required', () => {
    expect(() => parseDiwanFile(migrate({}))).toThrow()
    expect(() => parseDiwanFile({ schemaVersion: 1, settings: {} })).toThrow()
  })

  describe('repairs cosmetic fields in the stored file', () => {
    const acc = (over: Record<string, unknown>) =>
      parseDiwanFile({
        schemaVersion: 1,
        accounts: [{ id: id1, name: 'A', color: '#3b82f6', order: 0, ...over }],
      }).accounts[0]

    test('bad color', () => expect(acc({ color: 'red' }).color).toBe('#71717a'))
    test('long name truncated', () => expect(acc({ name: 'x'.repeat(41) }).name).toBe('x'.repeat(40)))
    test('bad name', () => {
      expect(acc({ name: '   ' }).name).toBe('Account')
      expect(acc({ name: 5 }).name).toBe('Account')
    })
    test('zoom clamped and rounded', () => {
      expect(acc({ zoom: 6 }).zoom).toBe(5)
      expect(acc({ zoom: 0.4 }).zoom).toBe(0)
      expect(acc({ zoom: 'x' }).zoom).toBe(0)
    })
    test('null flags', () => {
      expect(acc({ muted: null }).muted).toBe(false)
      expect(acc({ customAvatar: 1 }).customAvatar).toBe(false)
    })
    test('bad createdAt and order', () => {
      expect(Number.isNaN(Date.parse(acc({ createdAt: 5 }).createdAt))).toBe(false)
      expect(acc({ order: 'x' }).order).toBe(0)
    })
    test('settings repairs', () => {
      const f = parseDiwanFile({
        schemaVersion: 1,
        accounts: [],
        settings: {
          closeToTray: 'yes',
          notifications: { sound: 3 },
          window: { bounds: { x: 0, y: 0, width: 0, height: 500 }, maximized: 'no' },
        },
      })
      expect(f.settings).toEqual(DEFAULT_SETTINGS)
    })
    test('invalid id still throws', () => {
      expect(() => acc({ id: 'X'.repeat(36) })).toThrow()
      expect(() => acc({ id: '-'.repeat(36) })).toThrow()
    })
  })

  test('DEFAULT_SETTINGS is frozen deeply', () => {
    expect(Object.isFrozen(DEFAULT_SETTINGS)).toBe(true)
    expect(Object.isFrozen(DEFAULT_SETTINGS.notifications)).toBe(true)
    expect(Object.isFrozen(DEFAULT_SETTINGS.window)).toBe(true)
  })
  describe('repairs structural settings and the import flag', () => {
    const parse = (extra: Record<string, unknown>) =>
      parseDiwanFile({ schemaVersion: 1, accounts: [], ...extra })

    test('settings not an object gives defaults', () => {
      expect(parse({ settings: 'x' }).settings).toEqual(DEFAULT_SETTINGS)
    })
    test('notifications / window not objects give defaults', () => {
      expect(parse({ settings: { notifications: 5 } }).settings.notifications).toEqual(
        DEFAULT_SETTINGS.notifications,
      )
      expect(parse({ settings: { window: 'x' } }).settings.window).toEqual(DEFAULT_SETTINGS.window)
    })
    test('importedFromNexus', () => {
      expect(parse({ importedFromNexus: 'yes' }).importedFromNexus).toBe(true)
      expect(parse({}).importedFromNexus).toBe(false)
    })
    test('pendingFolderRemovals: missing or damaged gives [], duplicates are dropped', () => {
      expect(parse({}).pendingFolderRemovals).toEqual([])
      expect(parse({ pendingFolderRemovals: 'x' }).pendingFolderRemovals).toEqual([])
      expect(parse({ pendingFolderRemovals: [id1, '../etc'] }).pendingFolderRemovals).toEqual([])
      expect(parse({ pendingFolderRemovals: [id1, id2, id1] }).pendingFolderRemovals).toEqual([id1, id2])
    })
    test('repaired name has no trailing space', () => {
      const f = parse({ accounts: [{ id: id1, name: `${'x'.repeat(39)} yy`, color: '#3b82f6', order: 0 }] })
      expect(f.accounts[0].name).toBe('x'.repeat(39))
    })
  })
})
