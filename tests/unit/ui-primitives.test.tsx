// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { TOAST_MS, useUi } from '../../src/renderer/state'
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
  test('shows toasts in a live region and auto-dismisses them', () => {
    vi.useFakeTimers()
    render(<Toasts />)
    const region = screen.getByRole('region', { name: 'Messages' })
    expect(region.getAttribute('aria-live')).toBe('polite')
    act(() => useUi.getState().toast('Quit Nexus first'))
    expect(screen.getByText('Quit Nexus first')).toBeTruthy()
    act(() => vi.advanceTimersByTime(TOAST_MS - 1))
    expect(screen.queryByText('Quit Nexus first')).not.toBeNull()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.queryByText('Quit Nexus first')).toBeNull()
  })

  test('the close button dismisses one toast', async () => {
    const user = userEvent.setup()
    render(<Toasts />)
    act(() => {
      useUi.getState().toast('one')
      useUi.getState().toast('two')
    })
    await user.click(screen.getAllByRole('button', { name: 'Dismiss' })[0])
    expect(screen.queryByText('one')).toBeNull()
    expect(screen.getByText('two')).toBeTruthy()
  })

  test('names read in their own direction', () => {
    render(<Toasts />)
    act(() => useUi.getState().toast('محمد is offline'))
    const p = screen.getByText('محمد is offline')
    expect(p.getAttribute('dir')).toBe('auto')
    expect(p.className).toContain('bidi-plain')
  })
})
