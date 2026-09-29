import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from '@playwright/test';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PLAYWRIGHT_PORT || 4173);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.mjs/,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: process.env.CI ? 1 : undefined,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['line'], ['html', { outputFolder: 'playwright-report', open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium', viewport: { width: 1440, height: 960 } },
    },
  ],
});
