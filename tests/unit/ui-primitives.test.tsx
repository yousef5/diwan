// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { TOAST_MS, TOAST_RESUME_MIN_MS, useUi } from '../../src/renderer/state'
import { Button } from '../../src/renderer/ui/Button'
import { Dialog } from '../../src/renderer/ui/Dialog'
import { Kbd } from '../../src/renderer/ui/Kbd'
import { Switch } from '../../src/renderer/ui/Switch'
import { Toasts } from '../../src/renderer/ui/Toasts'
import { useEscape } from '../../src/renderer/ui/useEscape'

const initial = useUi.getState()

function Controlled({ start = false, disabled = false }: { start?: boolean; disabled?: boolean }) {
  const [on, setOn] = useState(start)
  return <Switch label="Play a sound" checked={on} onChange={setOn} disabled={disabled} />
}

function Host({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open && (
        <Dialog
          title="Add account"
          onClose={() => {
            onClose?.()
            setOpen(false)
          }}
          footer={
            <>
              <Button onClick={() => setOpen(false)}>Cancel</Button>
              <Button variant="primary">Save</Button>
            </>
          }
        >
          <input aria-label="Name" />
        </Dialog>
      )}
    </>
  )
}

// A menu item opens the dialog and unmounts in the same commit, like the account menu does.
function MenuFlow({
  returnFocus,
  tiles = true,
}: {
  returnFocus?: () => HTMLElement | null
  tiles?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      {tiles && (
        <>
          <button type="button" data-account-tile="a">
            Tile A
          </button>
          <button type="button" data-account-tile="b" data-active-tile="">
            Tile B
          </button>
        </>
      )}
      <main>stage</main>
      {open ? (
        <Dialog title="Remove" onClose={() => setOpen(false)} returnFocus={returnFocus} footer={null}>
          sure?
        </Dialog>
      ) : (
        <button type="button" onClick={() => setOpen(true)}>
          Menu item
        </button>
      )}
    </>
  )
}

function Layer({ name, onEscape, enabled }: { name: string; onEscape(n: string): void; enabled?: boolean }) {
  useEscape(() => onEscape(name), enabled)
  return null
}

beforeEach(() => {
  useUi.setState(initial, true)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Switch', () => {
  test('is a labelled switch that reports its state', () => {
    render(<Controlled start />)
    const sw = screen.getByRole('switch', { name: 'Play a sound' })
    expect(sw.getAttribute('aria-checked')).toBe('true')
  })

  test('click, Space and Enter toggle it', async () => {
    const user = userEvent.setup()
    render(<Controlled />)
    const sw = screen.getByRole('switch', { name: 'Play a sound' })
    await user.click(sw)
    expect(sw.getAttribute('aria-checked')).toBe('true')
    await user.keyboard(' ')
    expect(sw.getAttribute('aria-checked')).toBe('false')
    await user.keyboard('{Enter}')
    expect(sw.getAttribute('aria-checked')).toBe('true')
  })

  test('is reachable with Tab', async () => {
    const user = userEvent.setup()
    render(<Controlled />)
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('switch'))
  })

  test('disabled does not toggle', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Switch label="x" checked={false} onChange={onChange} disabled />)
    await user.click(screen.getByRole('switch'))
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('Button and Kbd', () => {
  test('Button defaults to type="button" and passes props through', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <Button variant="primary" aria-label="Go" onClick={onClick}>
        Go
      </Button>,
    )
    const b = screen.getByRole('button', { name: 'Go' })
    expect(b.getAttribute('type')).toBe('button')
    await user.click(b)
    expect(onClick).toHaveBeenCalledOnce()
  })

  test('Kbd is a <kbd>, left to right', () => {
    render(<Kbd>Ctrl 1</Kbd>)
    const k = screen.getByText('Ctrl 1')
    expect(k.tagName).toBe('KBD')
    expect(k.getAttribute('dir')).toBe('ltr')
  })
})

describe('Dialog', () => {
  test('is a modal dialog named by its title', async () => {
    const user = userEvent.setup()
    render(<Host />)
    await user.click(screen.getByText('Open'))
    const d = screen.getByRole('dialog', { name: 'Add account' })
    expect(d.getAttribute('aria-modal')).toBe('true')
  })

  test('moves focus in, traps Tab both ways, and restores focus on close', async () => {
    const user = userEvent.setup()
    render(<Host />)
    const opener = screen.getByText('Open')
    await user.click(opener)
    const name = screen.getByLabelText('Name')
    const save = screen.getByText('Save')
    expect(document.activeElement).toBe(name)

    await user.tab()
    expect(document.activeElement).toBe(screen.getByText('Cancel'))
    await user.tab()
    expect(document.activeElement).toBe(save)
    await user.tab()
    expect(document.activeElement).toBe(name)
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(save)

    await user.click(screen.getByText('Cancel'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  test('[data-autofocus] wins over the first control', () => {
    render(
      <Dialog title="Remove" onClose={() => {}} footer={<Button data-autofocus>Cancel</Button>}>
        <a href="#x">What removing an account deletes</a>
      </Dialog>,
    )
    expect(document.activeElement).toBe(screen.getByText('Cancel'))
  })

  test('Esc closes it and focus returns', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<Host onClose={onClose} />)
    const opener = screen.getByText('Open')
    await user.click(opener)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  test('a mousedown on the backdrop closes it; one inside does not', () => {
    const onClose = vi.fn()
    render(
      <Dialog title="T" onClose={onClose} footer={null}>
        body
      </Dialog>,
    )
    const panel = screen.getByRole('dialog')
    fireEvent.mouseDown(panel)
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.mouseDown(panel.parentElement as HTMLElement)
    expect(onClose).toHaveBeenCalledOnce()
  })

  test('without onClose it clears the store dialog', async () => {
    const user = userEvent.setup()
    useUi.getState().openDialog({ kind: 'add' })
    render(
      <Dialog title="T" footer={null}>
        body
      </Dialog>,
    )
    await user.keyboard('{Escape}')
    expect(useUi.getState().dialog).toBeNull()
  })
})

describe('Dialog focus', () => {
  test('hidden, aria-hidden, inert, type=hidden and fieldset-disabled controls are not tab stops', async () => {
    const user = userEvent.setup()
    render(
      <Dialog title="T" onClose={() => {}} footer={<Button>OK</Button>}>
        <input type="hidden" name="h" />
        <button type="button" hidden>
          Hidden
        </button>
        <div aria-hidden="true">
          <button type="button">Covered</button>
        </div>
        <div inert>
          <button type="button">Inert</button>
        </div>
        <fieldset disabled>
          <button type="button">In disabled fieldset</button>
        </fieldset>
        <button type="button">Real</button>
      </Dialog>,
    )
    expect(document.activeElement).toBe(screen.getByText('Real'))
    await user.tab()
    expect(document.activeElement).toBe(screen.getByText('OK'))
    await user.tab()
    expect(document.activeElement).toBe(screen.getByText('Real'))
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(screen.getByText('OK'))
  })

  const closeFrom = async (ui: Parameters<typeof render>[0]) => {
    const user = userEvent.setup()
    render(ui)
    await user.click(screen.getByText('Menu item'))
    expect(screen.getByRole('dialog')).toBeTruthy()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
  }

  test('opener gone: focus goes to returnFocus()', async () => {
    await closeFrom(<MenuFlow returnFocus={() => screen.getByText('Tile A')} />)
    expect(document.activeElement).toBe(screen.getByText('Tile A'))
  })

  test('opener gone, no returnFocus target: the active rail tile', async () => {
    await closeFrom(<MenuFlow returnFocus={() => null} />)
    expect(document.activeElement).toBe(screen.getByText('Tile B'))
  })

  test('a returnFocus target that cannot take focus is skipped', async () => {
    const dead = document.createElement('button')
    dead.disabled = true
    document.body.append(dead)
    await closeFrom(<MenuFlow returnFocus={() => dead} />)
    expect(document.activeElement).toBe(screen.getByText('Tile B'))
    dead.remove()
  })

  test('no tiles at all: the main region, never <body>', async () => {
    await closeFrom(<MenuFlow tiles={false} />)
    const main = screen.getByRole('main')
    expect(document.activeElement).toBe(main)
    expect(main.getAttribute('tabindex')).toBe('-1')
  })
})

describe('useEscape', () => {
  test('only the newest enabled layer handles Esc', async () => {
    const user = userEvent.setup()
    const hit = vi.fn()
    const { rerender } = render(
      <>
        <Layer name="settings" onEscape={hit} />
        <Layer name="menu" onEscape={hit} enabled={false} />
      </>,
    )
    await user.keyboard('{Escape}')
    expect(hit.mock.calls).toEqual([['settings']])

    rerender(
      <>
        <Layer name="settings" onEscape={hit} />
        <Layer name="menu" onEscape={hit} enabled />
      </>,
    )
    await user.keyboard('{Escape}')
    expect(hit.mock.calls).toEqual([['settings'], ['menu']])
  })

  test('a dialog over a page closes first', async () => {
    const user = userEvent.setup()
    const page = vi.fn()
    const dialog = vi.fn()
    const { rerender } = render(<Layer name="page" onEscape={page} />)
    rerender(
      <>
        <Layer name="page" onEscape={page} />
        <Dialog title="T" onClose={dialog} footer={null}>
          x
        </Dialog>
      </>,
    )
    await user.keyboard('{Escape}')
    expect(dialog).toHaveBeenCalledOnce()
    expect(page).not.toHaveBeenCalled()
  })

  test('ignores other keys, IME composition and handled events', () => {
    const hit = vi.fn()
    render(<Layer name="x" onEscape={hit} />)
    fireEvent.keyDown(window, { key: 'Enter' })
    fireEvent.keyDown(window, { key: 'Escape', isComposing: true })
    const handled = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
    handled.preventDefault()
    window.dispatchEvent(handled)
    expect(hit).not.toHaveBeenCalled()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(hit).toHaveBeenCalledOnce()
  })

  test('uses the newest callback without re-ordering', () => {
    const a = vi.fn()
    const b = vi.fn()
    const { rerender } = render(<Layer name="x" onEscape={a} />)
    rerender(<Layer name="x" onEscape={b} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalledOnce()
  })
})

describe('Toasts', () => {
  const stack = () => screen.getByRole('region', { name: 'Messages' })
  const status = () => screen.getByRole('status')

  test('the visible stack is not live; a hidden status region mirrors only the text', () => {
    vi.useFakeTimers()
    render(<Toasts />)
    expect(stack().hasAttribute('aria-live')).toBe(false)
    expect(status().className).toContain('sr-only')
    expect(status().getAttribute('aria-atomic')).toBe('false')
    act(() => useUi.getState().toast('Quit Nexus first'))
    expect(within(stack()).getByText('Quit Nexus first')).toBeTruthy()
    expect(within(stack()).getByRole('button', { name: 'Dismiss' })).toBeTruthy()
    expect(status().textContent).toBe('Quit Nexus first')
    expect(within(status()).queryByRole('button')).toBeNull()
  })

  test('a plain toast leaves after TOAST_MS', () => {
    vi.useFakeTimers()
    render(<Toasts />)
    act(() => useUi.getState().toast('Saved'))
    act(() => vi.advanceTimersByTime(TOAST_MS - 1))
    expect(within(stack()).queryByText('Saved')).not.toBeNull()
    act(() => vi.advanceTimersByTime(1))
    expect(within(stack()).queryByText('Saved')).toBeNull()
    expect(status().textContent).toBe('')
  })

  test('an error toast stays until dismissed', async () => {
    vi.useFakeTimers()
    render(<Toasts />)
    act(() => useUi.getState().toast('Could not reach WhatsApp', { error: true }))
    act(() => vi.advanceTimersByTime(TOAST_MS * 10))
    expect(within(stack()).getByText('Could not reach WhatsApp')).toBeTruthy()
    fireEvent.click(within(stack()).getByRole('button', { name: 'Dismiss' }))
    expect(within(stack()).queryByText('Could not reach WhatsApp')).toBeNull()
  })

  test('hover pauses the timer and leaving resumes it with the time that was left', () => {
    vi.useFakeTimers()
    render(<Toasts />)
    act(() => useUi.getState().toast('Saved'))
    act(() => vi.advanceTimersByTime(TOAST_MS - 2000))
    fireEvent.mouseEnter(stack())
    act(() => vi.advanceTimersByTime(TOAST_MS * 5))
    expect(within(stack()).queryByText('Saved')).not.toBeNull()
    fireEvent.mouseLeave(stack())
    act(() => vi.advanceTimersByTime(1999))
    expect(within(stack()).queryByText('Saved')).not.toBeNull()
    act(() => vi.advanceTimersByTime(1))
    expect(within(stack()).queryByText('Saved')).toBeNull()
  })

  test('resuming with almost nothing left still shows it for TOAST_RESUME_MIN_MS', () => {
    vi.useFakeTimers()
    render(<Toasts />)
    act(() => useUi.getState().toast('Saved'))
    act(() => vi.advanceTimersByTime(TOAST_MS - 10))
    fireEvent.mouseEnter(stack())
    fireEvent.mouseLeave(stack())
    act(() => vi.advanceTimersByTime(TOAST_RESUME_MIN_MS - 1))
    expect(within(stack()).queryByText('Saved')).not.toBeNull()
    act(() => vi.advanceTimersByTime(1))
    expect(within(stack()).queryByText('Saved')).toBeNull()
  })

  test('focus inside the stack pauses it; focus leaving resumes it', () => {
    vi.useFakeTimers()
    render(
      <>
        <button type="button">Elsewhere</button>
        <Toasts />
      </>,
    )
    act(() => useUi.getState().toast('Saved'))
    act(() => within(stack()).getByRole('button', { name: 'Dismiss' }).focus())
    expect(useUi.getState().toastsPaused).toBe(true)
    act(() => vi.advanceTimersByTime(TOAST_MS * 5))
    expect(within(stack()).queryByText('Saved')).not.toBeNull()
    act(() => screen.getByRole('button', { name: 'Elsewhere' }).focus())
    expect(useUi.getState().toastsPaused).toBe(false)
    act(() => vi.advanceTimersByTime(TOAST_MS))
    expect(within(stack()).queryByText('Saved')).toBeNull()
  })

  test('a toast that arrives while paused waits, then gets its full time', () => {
    vi.useFakeTimers()
    render(<Toasts />)
    act(() => useUi.getState().toast('one'))
    fireEvent.mouseEnter(stack())
    act(() => useUi.getState().toast('two'))
    act(() => vi.advanceTimersByTime(TOAST_MS * 2))
    fireEvent.mouseLeave(stack())
    act(() => vi.advanceTimersByTime(TOAST_MS - 1))
    expect(within(stack()).queryByText('two')).not.toBeNull()
    act(() => vi.advanceTimersByTime(1))
    expect(within(stack()).queryByText('two')).toBeNull()
  })

  test('dismissing the last hovered toast does not leave the next one paused', () => {
    vi.useFakeTimers()
    render(<Toasts />)
    act(() => useUi.getState().toast('one'))
    fireEvent.mouseEnter(stack())
    fireEvent.click(within(stack()).getByRole('button', { name: 'Dismiss' }))
    expect(useUi.getState().toastsPaused).toBe(false)
    act(() => useUi.getState().toast('two'))
    act(() => vi.advanceTimersByTime(TOAST_MS))
    expect(within(stack()).queryByText('two')).toBeNull()
  })

  test('the close button dismisses one toast', async () => {
    const user = userEvent.setup()
    render(<Toasts />)
    act(() => {
      useUi.getState().toast('one')
      useUi.getState().toast('two')
    })
    await user.click(within(stack()).getAllByRole('button', { name: 'Dismiss' })[0])
    expect(within(stack()).queryByText('one')).toBeNull()
    expect(within(stack()).getByText('two')).toBeTruthy()
  })

  test('names read in their own direction', () => {
    render(<Toasts />)
    act(() => useUi.getState().toast('محمد is offline'))
    const p = within(stack()).getByText('محمد is offline')
    expect(p.getAttribute('dir')).toBe('auto')
    expect(p.className).toContain('bidi-plain')
    expect(within(status()).getByText('محمد is offline').getAttribute('dir')).toBe('auto')
  })
})
