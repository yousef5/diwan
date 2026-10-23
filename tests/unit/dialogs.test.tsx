// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { nameError } from '../../src/renderer/components/AccountDialog'
import { Dialogs } from '../../src/renderer/components/Dialogs'
import { useUi } from '../../src/renderer/state'
import { colorForIndex } from '../../src/shared/palette'
import type { Account, ImportPlan, ImportResult, Snapshot } from '../../src/shared/types'

const initial = useUi.getState()
const invoke = vi.fn()

function account(id: string, name: string, extra: Partial<Account> = {}): Account {
  return {
    id,
    name,
    color: '#2563eb',
    order: 0,
    zoom: 0,
    muted: false,
    customAvatar: false,
    createdAt: '2026-10-22T00:00:00.000Z',
    ...extra,
  }
}

function snapshot(over: Partial<Snapshot> = {}): Snapshot {
  return {
    accounts: [account('a', 'Personal'), account('b', 'Pharmacy', { color: '#0d9488' })],
    runtime: {},
    activeId: 'a',
    settings: {} as Snapshot['settings'],
    recovery: false,
    importAvailable: true,
    trayAvailable: true,
    platform: 'linux',
    dataDir: '/home/u/.config/Diwan',
    ...over,
  }
}

// The rejection ipcRenderer.invoke gives for an Error thrown in a main handler.
const mainError = (channel: string, msg: string) =>
  new Error(`Error invoking remote method '${channel}': Error: ${msg}`)

function open(
  dialog: Parameters<ReturnType<typeof useUi.getState>['openDialog']>[0],
  over: Partial<Snapshot> = {},
) {
  act(() => {
    useUi.getState().setSnap(snapshot(over))
    useUi.getState().openDialog(dialog)
  })
  return render(<Dialogs />)
}

const nameBox = () => screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement
const radio = (name: string) => screen.getByRole('radio', { name })

beforeEach(() => {
  useUi.setState(initial, true)
  invoke.mockReset()
  invoke.mockResolvedValue(undefined)
  window.diwan = { invoke } as unknown as Window['diwan']
})
afterEach(() => {
  cleanup()
})

describe('nameError (same rule as main)', () => {
  test.each([
    ['Personal', null],
    ['  محمد يوسف  ', null],
    ['x'.repeat(40), null],
    ['', 'Enter a name for this account.'],
    ['   ', 'Enter a name for this account.'],
    ['​‍⁠', 'Enter a name for this account.'],
    ['x'.repeat(41), 'Use 40 characters or fewer.'],
  ])('%j → %j', (name, err) => {
    expect(nameError(name)).toBe(err)
  })
})

describe('AccountDialog: add', () => {
  test('the name field has focus, follows its own direction, and the next palette colour is picked', () => {
    open({ kind: 'add' })
    expect(screen.getByRole('dialog', { name: 'Add account' })).toBeTruthy()
    expect(document.activeElement).toBe(nameBox())
    expect(nameBox().getAttribute('dir')).toBe('auto')
    expect(nameBox().className).toContain('bidi-plain')
    // two accounts exist, so the third colour
    expect(screen.getByRole('radio', { checked: true }).getAttribute('data-color')).toBe(colorForIndex(2))
  })

  test('an empty or invisible name is refused with a message, and nothing is sent', async () => {
    const user = userEvent.setup()
    open({ kind: 'add' })
    expect(screen.queryByText('Enter a name for this account.')).toBeNull() // not before a try
    await user.click(screen.getByRole('button', { name: 'Add account' }))
    expect(screen.getByText('Enter a name for this account.')).toBeTruthy()
    expect(nameBox().getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(nameBox())
    await user.type(nameBox(), '​ {Enter}')
    expect(invoke).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  test('a name over 40 characters is flagged at once', async () => {
    const user = userEvent.setup()
    open({ kind: 'add' })
    await user.type(nameBox(), 'x'.repeat(41))
    expect(screen.getByText('Use 40 characters or fewer.')).toBeTruthy()
    const describedBy = nameBox().getAttribute('aria-describedby') ?? ''
    expect(document.getElementById(describedBy)?.textContent).toBe('Use 40 characters or fewer.')
    await user.keyboard('{Enter}')
    expect(invoke).not.toHaveBeenCalled()
  })

  test('Enter adds the account with the trimmed name and the chosen colour, then closes', async () => {
    const user = userEvent.setup()
    invoke.mockResolvedValue(account('z', 'محمد'))
    open({ kind: 'add' })
    await user.type(nameBox(), '  محمد  ')
    await user.click(radio('Violet'))
    await user.keyboard('{ArrowRight}') // Violet → Rose
    expect(radio('Rose').getAttribute('aria-checked')).toBe('true')
    expect(document.activeElement).toBe(radio('Rose'))
    nameBox().focus()
    await user.keyboard('{Enter}')
    expect(invoke).toHaveBeenCalledWith('account:add', { name: 'محمد', color: '#e11d48' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test('the colour picker is a radio group with one tab stop; arrows wrap, Home/End jump', async () => {
    const user = userEvent.setup()
    open({ kind: 'add' }, { accounts: [] })
    const group = screen.getByRole('radiogroup', { name: 'Colour' })
    const radios = within(group).getAllByRole('radio')
    expect(radios).toHaveLength(8)
    expect(radios.filter((r) => r.tabIndex === 0)).toEqual([radio('Blue')])
    radio('Blue').focus()
    await user.keyboard('{ArrowLeft}')
    expect(radio('Grey').getAttribute('aria-checked')).toBe('true')
    await user.keyboard('{Home}')
    expect(radio('Blue').getAttribute('aria-checked')).toBe('true')
    await user.keyboard('{End}')
    expect(document.activeElement).toBe(radio('Grey'))
    expect(radios.filter((r) => r.tabIndex === 0)).toEqual([radio('Grey')])
  })

  test('an error from main stays in the dialog; the dialog stays open', async () => {
    const user = userEvent.setup()
    invoke.mockRejectedValue(
      mainError('account:add', 'Cannot add accounts while the data file is in recovery mode'),
    )
    open({ kind: 'add' })
    await user.type(nameBox(), 'Work{Enter}')
    expect(screen.getByRole('alert').textContent).toContain(
      'Cannot add accounts while the data file is in recovery mode',
    )
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(useUi.getState().toasts).toEqual([]) // shown here, not twice
  })
})

describe('AccountDialog: edit', () => {
  test('starts from the account; saving unchanged sends nothing and closes', async () => {
    const user = userEvent.setup()
    open({ kind: 'edit', id: 'b' })
    expect(screen.getByRole('dialog', { name: 'Edit account' })).toBeTruthy()
    expect(nameBox().value).toBe('Pharmacy')
    expect(radio('Teal').getAttribute('aria-checked')).toBe('true')
    expect(screen.queryByText(/QR code/)).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(invoke).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test('sends only what changed', async () => {
    const user = userEvent.setup()
    open({ kind: 'edit', id: 'b' })
    await user.clear(nameBox())
    await user.type(nameBox(), 'صيدلية{Enter}')
    expect(invoke).toHaveBeenLastCalledWith('account:update', { id: 'b', patch: { name: 'صيدلية' } })

    cleanup()
    invoke.mockClear()
    open({ kind: 'edit', id: 'b' })
    await user.click(radio('Amber'))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(invoke).toHaveBeenLastCalledWith('account:update', { id: 'b', patch: { color: '#d97706' } })
  })

  test('a colour outside the palette is kept as "Current colour"', () => {
    open({ kind: 'edit', id: 'a' }, { accounts: [account('a', 'Odd', { color: '#123ABC' })] })
    expect(radio('Current colour').getAttribute('aria-checked')).toBe('true')
    expect(radio('Current colour').getAttribute('data-color')).toBe('#123abc')
  })
})

const item = (sourceId: string, name: string, bytes: number) => ({
  sourceId,
  name,
  color: '#2563eb',
  sourceDir: `/x/wa-${sourceId}`,
  bytes,
})

const PLAN: ImportPlan = {
  available: true,
  reason: null,
  items: [item('n1', 'Work', 1536 * 1024 * 1024), item('n2', 'محمد يوسف', 300 * 1024 * 1024)],
  orphanDirs: 2,
  nexusRunning: false,
}

// importer:plan answers `plans` in turn (the last one repeats); importer:apply answers `apply`.
function mainWith(plans: (ImportPlan | Error)[], apply?: () => Promise<ImportResult>) {
  let n = 0
  invoke.mockImplementation((channel: string) => {
    if (channel === 'importer:plan') {
      const p = plans[Math.min(n++, plans.length - 1)]
      return p instanceof Error ? Promise.reject(p) : Promise.resolve(p)
    }
    if (channel === 'importer:apply' && apply) return apply()
    return Promise.resolve(undefined)
  })
}

const importButton = () => screen.getByRole('button', { name: /^Import \d+ account/ })

describe('ImportDialog', () => {
  test('nothing found: says why, and offers no import', async () => {
    mainWith([
      {
        available: false,
        reason: 'Nexus is not installed on this computer',
        items: [],
        orphanDirs: 0,
        nexusRunning: false,
      },
    ])
    open({ kind: 'import' })
    expect(screen.getByRole('status').textContent).toBe('Looking for Nexus accounts…')
    expect(await screen.findByText(/Nexus isn’t installed on this computer/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Import/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy()
  })

  test('accounts found: names (own direction), sizes, total, leftovers, and the import button', async () => {
    mainWith([PLAN])
    open({ kind: 'import' })
    const list = await screen.findByRole('list', { name: 'Accounts to import' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows.map((r) => r.textContent)).toEqual(['WOWork1.5 GB', 'مي' + 'محمد يوسف300 MB'])
    const arabic = within(rows[1]).getByText('محمد يوسف')
    expect(arabic.getAttribute('dir')).toBe('auto')
    expect(arabic.className).toContain('bidi-plain')
    expect(screen.getByText('1.8 GB in all')).toBeTruthy()
    expect(screen.getByText(/2 leftover folders/)).toBeTruthy()
    expect((importButton() as HTMLButtonElement).disabled).toBe(false)
    expect(importButton().textContent).toBe('Import 2 accounts')
  })

  test('lists accounts imported earlier as left out', async () => {
    mainWith([{ ...PLAN, items: [PLAN.items[0]] }])
    open(
      { kind: 'import' },
      { accounts: [account('a', 'Personal'), account('b', 'بيت', { importedFrom: 'n9' })] },
    )
    const note = await screen.findByText(/Already imported, so left out/)
    expect(note.textContent).toBe('Already imported, so left out: بيت.')
    expect(importButton().textContent).toBe('Import 1 account')
  })

  test('everything already imported: says so', async () => {
    mainWith([
      { available: false, reason: 'Already imported', items: [], orphanDirs: 0, nexusRunning: false },
    ])
    open({ kind: 'import' }, { accounts: [account('b', 'Work', { importedFrom: 'n1' })] })
    expect(await screen.findByText('Every Nexus account is already in Diwan.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Import/ })).toBeNull()
  })

  test('Nexus running: "Quit Nexus first", import disabled until a re-check finds it closed', async () => {
    const user = userEvent.setup()
    mainWith([{ ...PLAN, nexusRunning: true }, PLAN])
    open({ kind: 'import' })
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Quit Nexus first.')
    expect((importButton() as HTMLButtonElement).disabled).toBe(true)
    await user.click(within(alert).getByRole('button', { name: 'Check again' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect((importButton() as HTMLButtonElement).disabled).toBe(false)
    expect(invoke.mock.calls.filter(([c]) => c === 'importer:plan')).toHaveLength(2)
  })

  test('the plan fails to load: main’s message and a retry', async () => {
    const user = userEvent.setup()
    mainWith([mainError('importer:plan', 'EACCES: permission denied'), PLAN])
    open({ kind: 'import' })
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('EACCES: permission denied')
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('list', { name: 'Accounts to import' })).toBeTruthy()
  })

  test('main refuses because Nexus is running: one clear warning, never a success', async () => {
    const user = userEvent.setup()
    mainWith([PLAN, { ...PLAN, nexusRunning: true }, PLAN], () =>
      Promise.reject(mainError('importer:apply', 'Quit Nexus first, then import again.')),
    )
    open({ kind: 'import' })
    await user.click(await screen.findByRole('button', { name: 'Import 2 accounts' }))
    // the re-plan shows Nexus running; main's refusal would only repeat that warning
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Quit Nexus first.'))
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.queryByText(/Import failed/)).toBeNull()
    expect(screen.queryByRole('dialog', { name: 'Import finished' })).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Import from Nexus' })).toBeTruthy()
    expect((importButton() as HTMLButtonElement).disabled).toBe(true)
    expect(useUi.getState().toasts).toEqual([])
    // Nexus quit: "Check again" clears everything and the import is offered again
    await user.click(screen.getByRole('button', { name: 'Check again' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect((importButton() as HTMLButtonElement).disabled).toBe(false)
  })

  test('any other failure from main shows as written (long paths wrap), never a success', async () => {
    const user = userEvent.setup()
    const msg =
      'EACCES: permission denied, open /home/joe/.config/Diwan/Partitions/acc-0a000000-0000-4000-8000-00000000000a.partial'
    mainWith([PLAN], () => Promise.reject(mainError('importer:apply', msg)))
    open({ kind: 'import' })
    await user.click(await screen.findByRole('button', { name: 'Import 2 accounts' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe(`Import failed: ${msg}`)
    expect(alert.querySelector('.\\[overflow-wrap\\:anywhere\\]')).not.toBeNull()
    expect(screen.queryByRole('dialog', { name: 'Import finished' })).toBeNull()
    expect((importButton() as HTMLButtonElement).disabled).toBe(false) // it can be tried again
  })

  test('while importing: progress shows, and the dialog cannot be dismissed', async () => {
    const user = userEvent.setup()
    let finish: (r: ImportResult) => void = () => {}
    mainWith([PLAN], () => new Promise((r) => (finish = r)))
    open({ kind: 'import' })
    await user.click(await screen.findByRole('button', { name: 'Import 2 accounts' }))
    expect(screen.getByRole('progressbar', { name: 'Importing' })).toBeTruthy()
    expect(screen.getByText(/Copying 2 accounts \(1.8 GB\)/)).toBeTruthy()
    expect((screen.getByRole('button', { name: /Importing…/ }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true)
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeTruthy()
    // nothing else (Settings, the menu) can replace it either
    expect(useUi.getState().importBusy).toBe(true)
    act(() => useUi.getState().openDialog({ kind: 'add' }))
    expect(useUi.getState().dialog).toEqual({ kind: 'import' })
    await act(async () => finish({ imported: ['Work', 'محمد يوسف'], failed: [] }))
    expect(useUi.getState().importBusy).toBe(false)
    expect(screen.getByRole('dialog', { name: 'Import finished' })).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Done' }))
  })

  test('success: names what was imported and warns about Nexus', async () => {
    const user = userEvent.setup()
    mainWith([PLAN], () => Promise.resolve({ imported: ['Work', 'محمد يوسف'], failed: [] }))
    open({ kind: 'import' })
    await user.click(await screen.findByRole('button', { name: 'Import 2 accounts' }))
    const dialog = await screen.findByRole('dialog', { name: 'Import finished' })
    expect(dialog.textContent).toContain('Imported 2 accounts. They open already signed in.')
    expect(within(dialog).getByText('محمد يوسف').getAttribute('dir')).toBe('auto')
    expect(dialog.textContent).toContain('You can now uninstall Nexus with your package manager.')
    expect(dialog.textContent).not.toContain('pacman')
    expect(screen.queryByRole('alert')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test('partial: what failed is shown with main’s reason', async () => {
    const user = userEvent.setup()
    mainWith([PLAN], () =>
      Promise.resolve({
        imported: ['Work'],
        failed: [{ name: 'محمد يوسف', error: 'ENOSPC: no space left on device' }],
      }),
    )
    open({ kind: 'import' })
    await user.click(await screen.findByRole('button', { name: 'Import 2 accounts' }))
    expect(await screen.findByRole('dialog', { name: 'Some accounts weren’t imported' })).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('ENOSPC: no space left on device')
  })

  test('every item failed: "Import failed", no success line, no Nexus advice', async () => {
    const user = userEvent.setup()
    mainWith([PLAN], () =>
      Promise.resolve({
        imported: [],
        failed: [
          { name: 'Work', error: 'source is not a plain folder' },
          { name: 'محمد يوسف', error: 'Nexus started during the import; quit it and try again' },
        ],
      }),
    )
    open({ kind: 'import' })
    await user.click(await screen.findByRole('button', { name: 'Import 2 accounts' }))
    const dialog = await screen.findByRole('dialog', { name: 'Import failed' })
    expect(dialog.textContent).not.toContain('Imported')
    expect(dialog.textContent).not.toContain('pacman')
    expect(screen.getByRole('alert').textContent).toContain('2 accounts couldn’t be imported')
  })

  test('recovery mode: the import is disabled and says why', async () => {
    mainWith([PLAN])
    open({ kind: 'import' }, { recovery: true })
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('settings file is damaged')
    expect((importButton() as HTMLButtonElement).disabled).toBe(true)
  })
})
