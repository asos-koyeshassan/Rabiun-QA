// @ts-check
const { defineConfig, devices } = require('@playwright/test');

const BASE_URL = process.env.SITE_BASE_URL || 'https://rabiun.com';

module.exports = defineConfig({
  testDir: './tests',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0, // one retry in CI so a flaky network blip doesn't cry wolf
  outputDir: 'test-results/artifacts',
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/results.json' }],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Never let a Shopify preview-theme cookie leak into a run — the site's own
    // release process notes that a stale preview cookie can make an old/unpublished
    // theme render on a plain rabiun.com URL. Fresh context per test avoids that.
    storageState: undefined,
  },
  projects: [
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 13'] },
    },
  ],
});
