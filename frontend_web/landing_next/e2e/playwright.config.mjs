import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.mjs/,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npx next dev --hostname 127.0.0.1 --port 3000',
    url: 'http://127.0.0.1:3000',
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: '1',
      PLATFORM_API_URL: 'http://127.0.0.1:9/api',
      NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3000',
      NEXT_PUBLIC_PLATFORM_URL: 'http://127.0.0.1:3000',
    },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium', viewport: { width: 1440, height: 960 } } }],
});
