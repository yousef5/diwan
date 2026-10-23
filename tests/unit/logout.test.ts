import { expect, test, vi } from 'vitest'
import { type LogoutDeps, logoutAccount } from '../../src/main/logout'
import type { AccountRuntime, ShellCommand } from '../../src/shared/types'

function setup(over: Partial<LogoutDeps> = {}) {
  let rt: AccountRuntime = { state: 'ready', unread: 5, avatar: 'x' }
  const sent: ShellCommand[] = []
  // setRuntime writes and shell commands, in the order main made them.
  const events: string[] = []
  const d: LogoutDeps = {
    hasAccount: () => true,
    runtimeOf: () => rt,
    setRuntime: (_i, p) => {
      rt = { ...rt, ...p }
      events.push(`state:${p.state}`)
    },
    clearCustomAvatar: vi.fn(),
    hasGuest: () => false,
    clearSession: async () => {},
    removeAvatar: vi.fn(),
    forgetNotifications: vi.fn(),
    forgetAvatar: vi.fn(),
    sendShell: (c) => {
      sent.push(c)
      events.push(c.type)
    },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    ...over,
  }
  return { d, sent, events, rt: () => rt }
}

test('success resets the account and remounts', async () => {
  const { d, sent, rt } = setup()
  await logoutAccount('a', d)
  expect(rt()).toEqual({ state: 'loading', unread: 0, avatar: null })
  expect(sent).toEqual([{ type: 'remount', id: 'a' }])
  expect(d.forgetAvatar).toHaveBeenCalledWith('a')
})

// sendShell flushes the hub first: a 'loading' written before the remount would reach the shell
// first and mount the old webview, which the bump then throws away.
test('the remount goes out while the account is still loggingOut, before loading', async () => {
  const { d, events } = setup()
  await logoutAccount('a', d)
  expect(events).toEqual(['state:loggingOut', 'remount', 'state:loading'])
})

test('the same order when the logout fails', async () => {
  const { d, events } = setup({
    clearSession: async () => {
      throw new Error('disk')
    },
  })
  await expect(logoutAccount('a', d)).rejects.toThrow('disk')
  expect(events).toEqual(['state:loggingOut', 'remount', 'state:loading'])
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
