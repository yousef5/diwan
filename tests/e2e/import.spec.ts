import { type ChildProcess, spawn } from 'node:child_process'
import { mkdirSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { expect, type Page, test } from '@playwright/test'
import {
  dropProfile,
  launch,
  makeProfile,
  onDisk,
  type Profile,
  type Running,
  readDiwan,
  settled,
  tile,
} from './helpers'

// A fake Nexus (the old MultiWhatsApp app) in the profile: its account list, one session folder per
// account, and, while "running", Chromium's SingletonLock pointing at a live process named nexus.
test.describe.configure({ mode: 'serial' })

let profile: Profile
let run: Running
let page: Page
let fakeNexus: ChildProcess | null = null

const nexusConfig = () => join(profile.nexusHome, '.newwhatsapp', 'config.json')
const nexusData = () => join(profile.nexusHome, '.config', 'MultiWhatsApp')
// A file Chromium never touches, so the copy can be compared after the guest has loaded.
const SESSION_FILE = 'e2e-session-marker'

function writeNexus(accounts: { id: string; name: string }[]): void {
  mkdirSync(join(profile.nexusHome, '.newwhatsapp'), { recursive: true })
  writeFileSync(nexusConfig(), JSON.stringify({ accounts: accounts.map((a, order) => ({ ...a, order })) }))
  for (const a of accounts) {
    const dir = join(nexusData(), 'Partitions', `wa-${a.id}`)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, SESSION_FILE), `session of ${a.id}`)
  }
}

// Nexus "runs": a live process whose name matches, behind <Nexus userData>/SingletonLock.
async function startNexus(): Promise<void> {
  const bin = join(profile.root, 'bin')
  mkdirSync(bin, { recursive: true })
  // `sleep` run through a link named nexus: the kernel names the process after the link
  symlinkSync('/usr/bin/sleep', join(bin, 'nexus'))
  fakeNexus = spawn(join(bin, 'nexus'), ['300'], { stdio: 'ignore' })
  await new Promise((resolve, reject) => fakeNexus?.once('spawn', resolve).once('error', reject))
  symlinkSync(`${hostname()}-${fakeNexus.pid}`, join(nexusData(), 'SingletonLock'))
}

async function quitNexus(): Promise<void> {
  const p = fakeNexus
  fakeNexus = null
  if (!p || p.exitCode !== null) return
  const exited = new Promise((resolve) => p.once('exit', resolve))
  p.kill()
  await exited
  unlinkSync(join(nexusData(), 'SingletonLock'))
}

const importDialog = () => page.getByRole('dialog', { name: 'Import from Nexus' })

async function openImportFromSettings(): Promise<void> {
  await page.getByRole('navigation', { name: 'Accounts' }).getByRole('button', { name: 'Settings' }).click()
  await page
    .getByRole('navigation', { name: 'Settings sections' })
    .getByRole('button', { name: 'Data' })
    .click()
  await page.getByRole('button', { name: 'Import from Nexus' }).click()
  await expect(importDialog()).toBeVisible()
}

async function closeSettings(): Promise<void> {
  await page.keyboard.press('Escape')
  await expect(page.getByRole('navigation', { name: 'Settings sections' })).toBeHidden()
}

test.beforeAll(async () => {
  profile = makeProfile()
  writeNexus([
    { id: 'a1', name: 'Pharmacy' },
    { id: 'b2', name: 'البيت' },
  ])
  await startNexus()
  run = await launch(profile)
  page = run.page
})

test.afterAll(async () => {
  await run?.app.close()
  await quitNexus()
  if (profile) dropProfile(profile)
})

test('the first launch offers the import, and refuses it while Nexus is running', async () => {
  const dialog = importDialog()
  await expect(dialog).toBeVisible()
  const list = dialog.getByRole('list', { name: 'Accounts to import' })
  await expect(list.getByRole('listitem')).toHaveText([/Pharmacy/, /البيت/])
  await expect(dialog.getByRole('alert')).toContainText('Quit Nexus first.')
  await expect(dialog.getByRole('button', { name: 'Import 2 accounts' })).toBeDisabled()
  // main refuses as well, should the import be asked for anyway (Nexus started after the plan)
  const refused = await page.evaluate(() =>
    window.diwan.invoke('importer:apply').then(
      () => 'imported',
      (e: unknown) => String(e),
    ),
  )
  expect(refused).toContain('Quit Nexus first')
  await expect(page.locator('[data-account-tile]')).toHaveCount(0)
})

test('once Nexus has quit, both accounts are imported signed in', async () => {
  await quitNexus()
  const dialog = importDialog()
  await dialog.getByRole('button', { name: 'Check again' }).click()
  await expect(dialog.getByRole('alert')).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Import 2 accounts' }).click()

  const done = page.getByRole('dialog', { name: 'Import finished' })
  await expect(done.getByRole('status')).toContainText('Imported 2 accounts')
  await expect(done.getByRole('listitem')).toHaveText(['Pharmacy', 'البيت'])
  await done.getByRole('button', { name: 'Done' }).click()
  await expect(done).toBeHidden()

  await expect(tile(page, 'Pharmacy')).toBeVisible()
  await expect(tile(page, 'البيت')).toBeVisible()
  await onDisk(profile, (f) => f.importedFromNexus && f.accounts.length === 2, 'import saved')
  const accounts = readDiwan(profile).accounts
  expect(accounts.map((a) => [a.name, a.importedFrom])).toEqual([
    ['Pharmacy', 'a1'],
    ['البيت', 'b2'],
  ])
  // each session folder was copied into the account's own partition
  for (const a of accounts) {
    const copied = join(profile.userData, 'Partitions', `acc-${a.id}`, SESSION_FILE)
    expect(readFileSync(copied, 'utf8')).toBe(`session of ${a.importedFrom}`)
  }
  await settled(run.app, 2)
})

test('opening the import again only offers what is new, never a duplicate', async () => {
  // Nexus gained an account since
  writeNexus([
    { id: 'a1', name: 'Pharmacy' },
    { id: 'b2', name: 'البيت' },
    { id: 'c3', name: 'Work' },
  ])
  await openImportFromSettings()
  const dialog = importDialog()
  await expect(dialog.getByRole('list', { name: 'Accounts to import' }).getByRole('listitem')).toHaveText([
    /Work/,
  ])
  await expect(dialog).toContainText('Already imported, so left out: Pharmacy, البيت.')
  await dialog.getByRole('button', { name: 'Import 1 account' }).click()
  const done = page.getByRole('dialog', { name: 'Import finished' })
  await expect(done.getByRole('listitem')).toHaveText(['Work'])
  await done.getByRole('button', { name: 'Done' }).click()
  await expect(tile(page, 'Work')).toBeVisible()

  // and a third look finds nothing left to import
  await page.getByRole('button', { name: 'Import from Nexus' }).click()
  await expect(importDialog()).toContainText('Every Nexus account is already in Diwan.')
  await expect(importDialog().getByRole('button', { name: /^Import \d/ })).toHaveCount(0)
  await importDialog().getByRole('button', { name: 'Cancel' }).click()
  await closeSettings()

  await onDisk(profile, (f) => f.accounts.length === 3, 'three accounts saved')
  const sources = readDiwan(profile).accounts.map((a) => a.importedFrom)
  expect(sources.toSorted()).toEqual(['a1', 'b2', 'c3'])
  await expect(page.locator('[data-account-tile]')).toHaveCount(3)
})
