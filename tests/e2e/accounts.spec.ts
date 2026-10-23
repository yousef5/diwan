import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, type Page, test } from '@playwright/test'
import {
  addAccount,
  contextBarName,
  dropProfile,
  type GuestInfo,
  guests,
  launch,
  makeProfile,
  nativeKey,
  onDisk,
  type Profile,
  type Running,
  readDiwan,
  settled,
  tile,
} from './helpers'

// One profile for the whole story: first launch → accounts → settings → relaunch.
test.describe.configure({ mode: 'serial' })

let profile: Profile
let run: Running
let page: Page
let loaded: GuestInfo[] // the guests once all three accounts had loaded

const ordered = () => [...readDiwan(profile).accounts].sort((a, b) => a.order - b.order)
const idOf = (name: string) => {
  const a = readDiwan(profile).accounts.find((x) => x.name === name)
  if (!a) throw new Error(`no account ${name}`)
  return a.id
}
const railOrder = (page: Page) =>
  page
    .locator('[data-account-tile]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-account-tile')))
// No guest was destroyed, created or reloaded since `loaded`.
const expectNoReload = async () => expect(await guests(run.app)).toEqual(loaded)

test.beforeAll(async () => {
  profile = makeProfile()
  run = await launch(profile)
  page = run.page
})

test.afterAll(async () => {
  await run?.app.close()
  if (profile) dropProfile(profile)
})

test('first launch shows the empty state', async () => {
  // the app runs under its own name and version (the fixture app folder carries package.json's)
  const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'))
  expect(await run.app.evaluate(({ app }) => [app.getName(), app.getVersion()])).toEqual([
    pkg.productName,
    pkg.version,
  ])
  await expect(page.getByRole('heading', { name: 'Welcome to Diwan' })).toBeVisible()
  // no Nexus in this profile: nothing to import, so no dialog and no import button
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Import from Nexus' })).toHaveCount(0)
  await expect(page.locator('[data-account-tile]')).toHaveCount(0)
  await expect(page.locator('webview')).toHaveCount(0)
})

test('adding an account shows its tile, its webview and the context bar', async () => {
  await page.getByRole('main').getByRole('button', { name: 'Add account' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByPlaceholder('Personal, Pharmacy, Family…')).toBeFocused()
  await dialog.getByPlaceholder('Personal, Pharmacy, Family…').fill('Test')
  await dialog.getByRole('button', { name: 'Add account' }).click()
  await expect(dialog).toBeHidden()

  await expect(tile(page, 'Test')).toBeVisible()
  await expect(tile(page, 'Test')).toHaveAttribute('aria-current', 'true')
  const id = idOf('Test')
  await expect(page.locator('webview')).toHaveCount(1)
  await expect(page.locator('webview')).toHaveAttribute('partition', `persist:acc-${id}`)
  await expect(contextBarName(page)).toHaveText('Test')
  await expect(page.getByTestId('connection')).toHaveText('Connected')
  await expect(page.getByRole('heading', { name: 'Welcome to Diwan' })).toHaveCount(0)
  await settled(run.app, 1)
})

test('switching accounts is fast and reloads nothing', async () => {
  await addAccount(page, 'Personal')
  await addAccount(page, 'Pharmacy')
  loaded = await settled(run.app, 3)
  expect(loaded.every((g) => g.loads === 1)).toBe(true)

  const times: number[] = []
  for (const name of ['Pharmacy', 'Personal', 'Test', 'Personal', 'Pharmacy', 'Test']) {
    const id = idOf(name)
    // Measured in the shell: from the click to the frame that shows the account's page and name.
    const ms = await page.evaluate(
      async ({ id, name }) => {
        const shown = () =>
          document.querySelector('header h1')?.textContent === name &&
          document.querySelector(`webview[data-account="${id}"]`)?.classList.contains('visible') === true
        const start = performance.now()
        document.querySelector<HTMLElement>(`[data-account-tile="${id}"]`)?.click()
        await new Promise<void>((resolve, reject) => {
          if (shown()) return resolve()
          const timer = setTimeout(() => reject(new Error(`switch to ${name} timed out`)), 5000)
          const watch = new MutationObserver(() => {
            if (!shown()) return
            watch.disconnect()
            clearTimeout(timer)
            resolve()
          })
          watch.observe(document.body, {
            subtree: true,
            childList: true,
            characterData: true,
            attributes: true,
          })
        })
        await new Promise((r) => requestAnimationFrame(r))
        return performance.now() - start
      },
      { id, name },
    )
    times.push(Math.round(ms))
    await expect(page.locator('webview.visible')).toHaveCount(1)
  }
  test.info().annotations.push({ type: 'switch ms', description: times.join(', ') })
  console.log(`switch times (ms): ${times.join(', ')}`)
  expect(Math.max(...times)).toBeLessThan(300)
  await expectNoReload()
})

test('settings open and close over the accounts without reloading them', async () => {
  await page.getByRole('navigation', { name: 'Accounts' }).getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByRole('navigation', { name: 'Settings sections' })).toBeVisible()
  await expect(page.locator('webview')).toHaveCount(3)
  await page.getByRole('switch', { name: 'Show window controls' }).click()
  await expect(page.getByRole('switch', { name: 'Show window controls' })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await page.keyboard.press('Escape')
  await expect(page.getByRole('navigation', { name: 'Settings sections' })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Minimize' })).toBeVisible()

  // Ctrl+, goes through main's shortcut handling and comes back as the openSettings command
  await nativeKey(run.app, ',', ['control'])
  await expect(page.getByRole('navigation', { name: 'Settings sections' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('navigation', { name: 'Settings sections' })).toBeHidden()

  await onDisk(profile, (f) => f.settings.showWindowControls, 'showWindowControls saved')
  await expectNoReload()
})

test('rename (Arabic), mute and reorder', async () => {
  // rename through the tile's menu
  await tile(page, 'Personal').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Edit name and colour…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Edit account' })
  await dialog.getByRole('textbox').fill('العائلة')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toBeHidden()
  await expect(tile(page, 'العائلة')).toBeVisible()
  await expect(tile(page, 'العائلة')).toHaveText('عا') // initials skip the article
  await onDisk(profile, (f) => f.accounts.some((a) => a.name === 'العائلة'), 'Arabic name saved')

  // mute from the context bar
  await tile(page, 'Pharmacy').click()
  await page.getByRole('button', { name: 'Mute notifications for Pharmacy' }).click()
  await expect(page.locator('header')).toContainText('Muted')
  await expect(tile(page, 'Pharmacy')).toHaveAttribute('aria-label', 'Pharmacy, muted')
  await onDisk(profile, (f) => f.accounts.find((a) => a.name === 'Pharmacy')?.muted === true, 'mute saved')

  // reorder from the keyboard: the first tile moves down one, and keeps the focus
  const before = ordered().map((a) => a.id)
  const first = page.locator(`[data-account-tile="${before[0]}"]`)
  await first.focus()
  await page.keyboard.press('Alt+ArrowDown')
  const expected = [before[1], before[0], ...before.slice(2)]
  await onDisk(
    profile,
    (f) =>
      f.accounts
        .toSorted((a, b) => a.order - b.order)
        .map((a) => a.id)
        .join() === expected.join(),
    'order saved',
  )
  await expect.poll(() => railOrder(page)).toEqual(expected)
  await expect(first).toBeFocused()
  await expectNoReload()
})

let victim = ''

test('removing an account moves focus to the next tile and tombstones its folder', async () => {
  const order = ordered().map((a) => a.id)
  victim = order[1]
  const next = order[2]
  await page.locator(`[data-account-tile="${victim}"]`).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Remove account…' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(page.locator(`[data-account-tile="${victim}"]`)).toHaveCount(0)
  await expect(page.locator(`[data-account-tile="${next}"]`)).toBeFocused()
  await expect(page.locator('webview')).toHaveCount(2)
  await onDisk(
    profile,
    (f) => !f.accounts.some((a) => a.id === victim) && f.pendingFolderRemovals.includes(victim),
    'account removed and tombstoned',
  )
})

test('a relaunch keeps names, mute, order and settings, and sweeps the removed folder', async () => {
  await run.app.close()
  const saved = readDiwan(profile)
  expect(saved.pendingFolderRemovals).toContain(victim)
  // Electron can leave the removed session's folder behind as an empty shell: the next start sweeps it.
  const leftover = join(profile.userData, 'Partitions', `acc-${victim}`)
  mkdirSync(leftover, { recursive: true })
  writeFileSync(join(leftover, 'Preferences'), '{}')

  run = await launch(profile)
  page = run.page
  const order = ordered()
  await expect(page.locator('[data-account-tile]')).toHaveCount(2)
  expect(await railOrder(page)).toEqual(order.map((a) => a.id))
  expect(order.map((a) => a.name).sort()).toEqual(['Pharmacy', 'العائلة'].sort())
  await expect(tile(page, 'Pharmacy')).toHaveAttribute('aria-label', 'Pharmacy, muted')
  await expect(tile(page, 'العائلة')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Minimize' })).toBeVisible()
  await onDisk(profile, (f) => !f.pendingFolderRemovals.includes(victim), 'tombstone cleared')
  expect(existsSync(leftover)).toBe(false)
  await settled(run.app, 2)
})
