import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { addAccount, dropProfile, launch, makeProfile, onDisk, readDiwan } from './helpers'

test('a damaged settings file opens in recovery mode, and Start fresh recovers', async () => {
  const profile = makeProfile()
  const damaged = '{"schemaVersion": 1, "accounts": [ broken'
  writeFileSync(join(profile.userData, 'diwan.json'), damaged)
  const { app, page } = await launch(profile)
  try {
    const banner = page.getByRole('alert').filter({ hasText: 'settings file is damaged' })
    await expect(banner).toBeVisible()
    // nothing can be added (it could not be saved), and the damaged file is left alone
    await expect(
      page.getByRole('navigation', { name: 'Accounts' }).getByRole('button', { name: 'Add account' }),
    ).toBeDisabled()
    await expect(page.getByRole('main').getByRole('button', { name: 'Add account' })).toBeDisabled()
    expect(readFileSync(join(profile.userData, 'diwan.json'), 'utf8')).toBe(damaged)

    await banner.getByRole('button', { name: 'Start fresh' }).click()
    const confirm = page.getByRole('dialog', { name: 'Start with fresh settings?' })
    await confirm.getByRole('button', { name: 'Start fresh' }).click()
    await expect(confirm).toBeHidden()
    await expect(banner).toHaveCount(0)

    // the damaged file is kept next to a new, valid one
    const kept = readdirSync(profile.userData).filter((n) => n.startsWith('diwan.json.broken-'))
    expect(kept).toHaveLength(1)
    expect(readFileSync(join(profile.userData, kept[0]), 'utf8')).toBe(damaged)
    expect(readDiwan(profile).accounts).toEqual([])

    // and the app works again: an account can be added and is saved
    await page.getByRole('main').getByRole('button', { name: 'Add account' }).click()
    await page.getByRole('dialog').getByPlaceholder('Personal, Pharmacy, Family…').fill('Fresh')
    await page.getByRole('dialog').getByRole('button', { name: 'Add account' }).click()
    await expect(page.locator('[data-account-tile]')).toHaveCount(1)
    await addAccount(page, 'Second')
    await onDisk(profile, (f) => f.accounts.map((a) => a.name).join() === 'Fresh,Second', 'accounts saved')
  } finally {
    await app.close()
    dropProfile(profile)
  }
})
