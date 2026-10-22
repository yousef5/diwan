import { describe, expect, test } from 'vitest'
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
    })
  })

  test('fills missing nested settings and drops unknown keys', () => {
    const f = parseDiwanFile({
      schemaVersion: 1,
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
})
