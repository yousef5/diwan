import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type ElectronApplication, _electron as electron, expect, type Page } from '@playwright/test'
import type { DiwanFile } from '../../src/shared/types'

// The suite only runs through tests/e2e/run.sh (`bun run e2e`): a private D-Bus session and a
// virtual X display, so no window ever shows on the real desktop.
if (process.env.DIWAN_E2E_HEADLESS !== '1')
  throw new Error(
    'Run the E2E suite with `bun run e2e` (headless Xvfb + private D-Bus), not playwright directly',
  )

const FIXTURE = join(__dirname, 'fixtures')

// A throwaway profile: every directory the app could touch lives under one temp folder.
export interface Profile {
  root: string
  home: string
  userData: string
  nexusHome: string
  downloads: string
  config: string
}

export function makeProfile(): Profile {
  const root = mkdtempSync(join(tmpdir(), 'diwan-e2e-'))
  const p: Profile = {
    root,
    home: join(root, 'home'),
    userData: join(root, 'data'),
    nexusHome: join(root, 'nexus'),
    downloads: join(root, 'downloads'),
    config: join(root, 'home', '.config'),
  }
  for (const dir of [p.home, p.userData, p.nexusHome, p.downloads, p.config])
    mkdirSync(dir, { recursive: true })
  return p
}

export function dropProfile(p: Profile): void {
  if (process.env.DIWAN_E2E_KEEP !== '1') rmSync(p.root, { recursive: true, force: true })
}

export interface Running {
  app: ElectronApplication
  page: Page
}

export async function launch(p: Profile): Promise<Running> {
  // A dev server URL would make main load the shell from it.
  const { ELECTRON_RENDERER_URL: _dev, ...env } = process.env
  const app = await electron.launch({
    args: ['--ozone-platform=x11', FIXTURE],
    env: {
      ...(env as Record<string, string>),
      HOME: p.home,
      XDG_CONFIG_HOME: p.config,
      XDG_DATA_HOME: join(p.home, '.local', 'share'),
      XDG_CACHE_HOME: join(p.home, '.cache'),
      XDG_DOWNLOAD_DIR: p.downloads,
      DIWAN_USER_DATA: p.userData,
      DIWAN_NEXUS_HOME: p.nexusHome,
    },
  })
  const page = await app.firstWindow()
  // the shell has drawn its first snapshot: the rail is there
  await expect(page.getByRole('navigation', { name: 'Accounts' })).toBeVisible()
  return { app, page }
}

export const readDiwan = (p: Profile): DiwanFile =>
  JSON.parse(readFileSync(join(p.userData, 'diwan.json'), 'utf8')) as DiwanFile

// Reads diwan.json until `check` holds (the store saves 300 ms after a change).
export async function onDisk(p: Profile, check: (f: DiwanFile) => boolean, message: string): Promise<void> {
  await expect
    .poll(
      () => {
        try {
          return check(readDiwan(p))
        } catch {
          return false
        }
      },
      { message },
    )
    .toBe(true)
}

export const tile = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Accounts' }).getByRole('button', { name: new RegExp(`^${name}`) })

export const contextBarName = (page: Page) => page.locator('header h1')

export async function addAccount(page: Page, name: string): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Accounts' })
    .getByRole('button', { name: 'Add account' })
    .click()
  const dialog = page.getByRole('dialog')
  await dialog.getByPlaceholder('Personal, Pharmacy, Family…').fill(name)
  await dialog.getByRole('button', { name: 'Add account' }).click()
  await expect(dialog).toBeHidden()
  await expect(tile(page, name)).toBeVisible()
}

export interface GuestInfo {
  id: number
  partition: string
  loads: number
  destroyed: boolean
}

// Every <webview> guest the app has created so far, with how often each started loading.
export const guests = (app: ElectronApplication): Promise<GuestInfo[]> =>
  app.evaluate(() =>
    (globalThis as unknown as { __e2e: { guests: GuestInfo[] } }).__e2e.guests.map((g) => ({ ...g })),
  )

export const liveGuests = async (app: ElectronApplication) => (await guests(app)).filter((g) => !g.destroyed)

// Waits until every live guest has finished loading the stand-in page (the account shows Connected).
export async function settled(app: ElectronApplication, count: number): Promise<GuestInfo[]> {
  await expect
    .poll(
      () =>
        app.evaluate(({ webContents }, n) => {
          const live = webContents.getAllWebContents().filter((w) => w.getType() === 'webview')
          return (
            live.length === n &&
            live.every((w) => !w.isLoading() && w.getURL().startsWith('https://web.whatsapp.com'))
          )
        }, count),
      { message: `${count} guests loaded` },
    )
    .toBe(true)
  return liveGuests(app)
}

// Runs `code` inside an account's stand-in WhatsApp page.
export const inGuest = (app: ElectronApplication, accountId: string, code: string): Promise<unknown> =>
  app.evaluate(
    ({ webContents }, { accountId, code }) => {
      const wc = webContents
        .getAllWebContents()
        .find((w) => w.getType() === 'webview' && w.session.storagePath?.endsWith(`acc-${accountId}`))
      if (!wc) throw new Error(`no guest for ${accountId}`)
      return wc.executeJavaScript(code)
    },
    { accountId, code },
  )

export const windowTitle = (app: ElectronApplication): Promise<string> =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getTitle() ?? '')

// A key press as the OS would deliver it to the shell window (through main's before-input-event,
// which Playwright's page.keyboard bypasses): how main's own shortcuts are reached.
export const nativeKey = (
  app: ElectronApplication,
  keyCode: string,
  modifiers: ('control' | 'alt' | 'shift')[] = [],
) =>
  app.evaluate(
    ({ BrowserWindow }, { keyCode, modifiers }) => {
      const wc = BrowserWindow.getAllWindows()[0].webContents
      wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
      wc.sendInputEvent({ type: 'char', keyCode, modifiers })
      wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
    },
    { keyCode, modifiers },
  )
