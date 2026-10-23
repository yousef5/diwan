import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, vi } from 'vitest'
import { type LogoutDeps, logoutAccount } from '../../src/main/logout'
import { StateHub } from '../../src/main/state'
import { Store } from '../../src/main/store/store'
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

// The real pieces: a StateHub (throttled runtime pushes) and a sendShell that flushes it first, as
// main's does. What the shell receives must be loggingOut … remount … loading, never loading first.
test('with a real StateHub and a flushing sendShell, the shell sees the remount before loading', async () => {
  const hub = new StateHub(new Store(mkdtempSync(join(tmpdir(), 'diwan-logout-')), 0), undefined, 50)
  const { id } = hub.addAccount('A', '#2563eb')
  hub.setRuntime(id, { state: 'ready' })
  await new Promise((r) => setTimeout(r, 60))
  const shell: string[] = []
  hub.on('changed', (s) => shell.push(`snap:${s.runtime[id]?.state}`))
  await logoutAccount(id, {
    hasAccount: (x) => !!hub.account(x),
    runtimeOf: (x) => hub.runtimeOf(x),
    setRuntime: (x, p) => hub.setRuntime(x, p),
    clearCustomAvatar: (x) => hub.updateAccount(x, { customAvatar: false }),
    hasGuest: () => false,
    clearSession: async () => {},
    removeAvatar: () => {},
    forgetNotifications: () => {},
    forgetAvatar: () => {},
    sendShell: (c) => {
      hub.flush()
      shell.push(c.type)
    },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  })
  await new Promise((r) => setTimeout(r, 120)) // let the trailing push out
  const remount = shell.indexOf('remount')
  expect(remount).toBeGreaterThan(0)
  expect(shell.slice(0, remount)).not.toContain('snap:loading')
  expect(shell[remount - 1]).toBe('snap:loggingOut')
  expect(shell.slice(remount + 1)).toEqual(['snap:loading'])
  expect(hub.runtimeOf(id).state).toBe('loading')
})
