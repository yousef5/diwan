import type { ElectronApplication } from '@playwright/test'
import { expect, type Page, test } from '@playwright/test'
import {
  addAccount,
  contextBarName,
  dropProfile,
  guests,
  inGuest,
  launch,
  makeProfile,
  type Profile,
  type Running,
  readDiwan,
  settled,
  tile,
  windowTitle,
} from './helpers'

// What the stand-in WhatsApp pages do reaches the shell, the window title, the tray and the
// desktop notifications: unread counts, notifications, and a logout's fresh page.
test.describe.configure({ mode: 'serial' })

let profile: Profile
let run: Running
let page: Page
const ids: Record<string, string> = {}

interface Recorded {
  title: string
  body: string
}
type E2E = { notifications: (Recorded & { emit(event: string): void })[]; tray: string[] }

const notifications = (app: ElectronApplication) =>
  app.evaluate(() =>
    (globalThis as unknown as { __e2e: E2E }).__e2e.notifications.map((n) => ({
      title: n.title,
      body: n.body,
    })),
  )
const lastTrayBadge = (app: ElectronApplication) =>
  app.evaluate(() => (globalThis as unknown as { __e2e: E2E }).__e2e.tray.at(-1) ?? null)

test.beforeAll(async () => {
  profile = makeProfile()
  run = await launch(profile)
  page = run.page
  for (const name of ['Alpha', 'Beta', 'Gamma']) await addAccount(page, name)
  for (const a of readDiwan(profile).accounts) ids[a.name] = a.id
  await settled(run.app, 3)
  // Gamma is muted: it counts toward nothing and never notifies
  await tile(page, 'Gamma').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Mute notifications' }).click()
  await expect(tile(page, 'Gamma')).toHaveAttribute('aria-label', 'Gamma, muted')
  await tile(page, 'Beta').click()
  await expect(contextBarName(page)).toHaveText('Beta')
})

test.afterAll(async () => {
  await run?.app.close()
  if (profile) dropProfile(profile)
})

test('unread counts reach the rail, the window title and the tray badge', async () => {
  // the shell has drawn the tray badges and main shows the plain icon
  await expect.poll(() => lastTrayBadge(run.app)).toBe('none')
  expect(await windowTitle(run.app)).toBe('Diwan')

  await inGuest(run.app, ids.Alpha, `document.title = '(3) WhatsApp'`)
  await inGuest(run.app, ids.Gamma, `document.title = '(7) WhatsApp'`) // muted: not counted
  await expect.poll(() => windowTitle(run.app)).toBe('Diwan (3)')
  await expect.poll(() => lastTrayBadge(run.app)).toBe('3')
  await expect(tile(page, 'Alpha')).toHaveAttribute('aria-label', 'Alpha, 3 unread')
  await expect(tile(page, 'Gamma')).toHaveAttribute('aria-label', 'Gamma, 7 unread, muted')
  await expect(page.getByRole('button', { name: 'Inbox, 3 unread' })).toBeVisible()

  await inGuest(run.app, ids.Alpha, `document.title = '(25) WhatsApp'`)
  await expect.poll(() => windowTitle(run.app)).toBe('Diwan (25)')
  await expect.poll(() => lastTrayBadge(run.app)).toBe('9+')

  await inGuest(run.app, ids.Alpha, `document.title = 'WhatsApp'`)
  await expect.poll(() => windowTitle(run.app)).toBe('Diwan')
  await expect.poll(() => lastTrayBadge(run.app)).toBe('none')
  await expect(tile(page, 'Alpha')).toHaveAttribute('aria-label', 'Alpha')
})

test('a notification from a background account is shown natively, and clicking it opens the account', async () => {
  const before = (await notifications(run.app)).length
  await inGuest(
    run.app,
    ids.Alpha,
    `new Notification('Ahmed', { body: 'Hello from the stand-in', tag: 't1' }); 1`,
  )
  await expect.poll(async () => (await notifications(run.app)).length).toBe(before + 1)
  const shown = (await notifications(run.app)).at(-1)
  expect(shown?.title).toContain('Alpha')
  expect(shown?.title).toContain('Ahmed')
  expect(shown?.body).toBe('Hello from the stand-in')

  await run.app.evaluate(() =>
    (globalThis as unknown as { __e2e: E2E }).__e2e.notifications.at(-1)?.emit('click'),
  )
  await expect(contextBarName(page)).toHaveText('Alpha')
  await expect(tile(page, 'Alpha')).toHaveAttribute('aria-current', 'true')

  // a muted account never notifies (checked after a notification that did go through, so the
  // muted one had the time to arrive)
  await inGuest(run.app, ids.Gamma, `new Notification('Muted', { body: 'x' }); 1`)
  await inGuest(run.app, ids.Beta, `new Notification('Sara', { body: 'after the muted one' }); 1`)
  await expect.poll(async () => (await notifications(run.app)).length).toBe(before + 2)
  expect((await notifications(run.app)).at(-1)?.body).toBe('after the muted one')
})

test('logging out replaces the page with exactly one fresh one', async () => {
  const partition = `acc-${ids.Beta}`
  const ofBeta = async () => (await guests(run.app)).filter((g) => g.partition.endsWith(partition))
  const [old] = await ofBeta()
  expect(old.destroyed).toBe(false)
  const others = (await guests(run.app)).filter((g) => !g.partition.endsWith(partition))

  await tile(page, 'Beta').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Log out…' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Log out', exact: true }).click()

  await expect
    .poll(async () => (await ofBeta()).map((g) => [g.destroyed, g.loads]))
    .toEqual([
      [true, 1],
      [false, 1],
    ])
  await settled(run.app, 3)
  await tile(page, 'Beta').click()
  await expect(page.getByTestId('connection')).toHaveText('Connected')
  // still exactly one new page, and the other accounts were left alone
  expect((await ofBeta()).length).toBe(2)
  expect((await guests(run.app)).filter((g) => !g.partition.endsWith(partition))).toEqual(others)
})
