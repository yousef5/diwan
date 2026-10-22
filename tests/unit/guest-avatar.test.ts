import { expect, test, vi } from 'vitest'
import { forgetAvatar, handleGuestAvatar } from '../../src/main/guest-avatar'

function setup() {
  let avatar: string | null = null
  let n = 0
  const save = vi.fn(() => `file://a${++n}`)
  const deps = {
    account: () => ({ customAvatar: false }),
    currentAvatar: () => avatar,
    decode: () => ({ isEmpty: () => false }) as never,
    save,
    setAvatar: (_id: string, url: string) => {
      avatar = url
    },
  }
  return { deps, save, clear: () => (avatar = null) }
}

test('the same picture twice while still shown is skipped', () => {
  const { deps, save } = setup()
  handleGuestAvatar('x1', 'data:image/png;base64,AAA', deps)
  handleGuestAvatar('x1', 'data:image/png;base64,AAA', deps)
  expect(save).toHaveBeenCalledTimes(1)
})

test('the same picture is saved again after logout / clearAvatar', () => {
  const { deps, save, clear } = setup()
  handleGuestAvatar('x2', 'data:image/png;base64,AAA', deps)
  clear()
  forgetAvatar('x2')
  handleGuestAvatar('x2', 'data:image/png;base64,AAA', deps)
  expect(save).toHaveBeenCalledTimes(2)
})

test('even without forget, a cleared avatar is saved again', () => {
  const { deps, save, clear } = setup()
  handleGuestAvatar('x3', 'data:image/png;base64,AAA', deps)
  clear()
  handleGuestAvatar('x3', 'data:image/png;base64,AAA', deps)
  expect(save).toHaveBeenCalledTimes(2)
})
