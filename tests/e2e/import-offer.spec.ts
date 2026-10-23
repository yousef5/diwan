import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type ElectronApplication, expect, test } from '@playwright/test'
import { dropProfile, launch, makeProfile } from './helpers'

// Nexus installed but with nothing to import (its accounts never signed in, so no session folders):
// the first launch must not offer an import that can only say "nothing to import".
test('no import offer when Nexus has no signed-in accounts', async () => {
  const profile = makeProfile()
  mkdirSync(join(profile.nexusHome, '.newwhatsapp'), { recursive: true })
  writeFileSync(
    join(profile.nexusHome, '.newwhatsapp', 'config.json'),
    JSON.stringify({ accounts: [{ id: 'a1', name: 'Pharmacy', order: 0 }] }),
  )
  mkdirSync(join(profile.nexusHome, '.config', 'MultiWhatsApp', 'Partitions'), { recursive: true })
  let app: ElectronApplication | undefined
  try {
    const launched = await launch(profile)
    app = launched.app
    const page = launched.page
    await expect(page.getByRole('heading', { name: 'Welcome to Diwan' })).toBeVisible()
    await expect(page.getByRole('main').getByRole('button', { name: 'Add account' })).toBeVisible()
    // the snapshot has arrived and been acted on: still no dialog, and no import button
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Import from Nexus' })).toHaveCount(0)
    const offered = await page.evaluate(() => window.diwan.invoke('state:get').then((s) => s.importAvailable))
    expect(offered).toBe(false)
  } finally {
    await app?.close()
    dropProfile(profile)
  }
})
