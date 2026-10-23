import { defineConfig } from '@playwright/test'

// End-to-end tests: the real built app in hidden Electron, against a stand-in WhatsApp page.
// Run with `bun run e2e` (builds, then tests/e2e/run.sh: Xvfb + a private D-Bus, never the real
// desktop). Unit tests are Vitest's (tests/unit); vitest.config.ts only includes tests/unit.
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: 'list',
  // a rare failure leaves a trace (test-results/) to open with `bunx playwright show-trace`
  use: { trace: 'retain-on-failure' },
})
