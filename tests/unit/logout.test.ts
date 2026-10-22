import { expect, test, vi } from 'vitest'
import { type LogoutDeps, logoutAccount } from '../../src/main/logout'
import type { AccountRuntime, ShellCommand } from '../../src/shared/types'

function setup(over: Partial<LogoutDeps> = {}) {
  let rt: AccountRuntime = { state: 'ready', unread: 5, avatar: 'x' }
  const sent: ShellCommand[] = []
  const d: LogoutDeps = {
    hasAccount: () => true,
    runtimeOf: () => rt,
    setRuntime: (_i, p) => {
      rt = { ...rt, ...p }
    },
    clearCustomAvatar: vi.fn(),
    hasGuest: () => false,
    clearSession: async () => {},
    removeAvatar: vi.fn(),
    forgetNotifications: vi.fn(),
    forgetAvatar: vi.fn(),
    sendShell: (c) => sent.push(c),
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    ...over,
  }
  return { d, sent, rt: () => rt }
}

test('success resets the account and remounts', async () => {
  const { d, sent, rt } = setup()
  await logoutAccount('a', d)
  expect(rt()).toEqual({ state: 'loading', unread: 0, avatar: null })
  expect(sent).toEqual([{ type: 'remount', id: 'a' }])
  expect(d.forgetAvatar).toHaveBeenCalledWith('a')
})

test('a failing clearStorageData does not leave the account stuck', async () => {
  const { d, sent, rt } = setup({
    clearSession: async () => {
      throw new Error('boom')
    },
  })
  await expect(logoutAccount('a', d)).rejects.toThrow('boom')
  expect(rt().state).toBe('loading')
  expect(rt().unread).toBe(5)
  expect(sent).toEqual([{ type: 'remount', id: 'a' }])
})

test('a detach timeout is logged and logout still proceeds', async () => {
  const { d, rt } = setup({ hasGuest: () => true, detachTimeoutMs: 20, pollMs: 5 })
  await logoutAccount('a', d)
  expect(d.log.warn).toHaveBeenCalled()
  expect(rt().state).toBe('loading')
})

test('an unknown account is a no-op', async () => {
  const { d, sent } = setup({ hasAccount: () => false })
  await logoutAccount('a', d)
  expect(sent).toHaveLength(0)
})
