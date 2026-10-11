import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test('login renders and rejects an empty submission', async ({ app, screen, browser }) => {
  // Match the existing Playwright suite's signed-out API boundary.
  // This test proves frontend behavior, not Django session authentication.
  await browser.route('**/api/v1/users/me/', route => route.fulfill({
    status: 401, json: { detail: 'Unauthenticated' },
  }));
  await browser.route('**/api/v1/users/csrf/', route => route.fulfill({
    status: 200, json: { csrfToken: 'smoke-csrf' },
  }));
  await browser.route('**/api/v1/users/token/refresh/', route => route.fulfill({
    status: 401, json: { detail: 'Unauthenticated' },
  }));
  await app.open('/login');
  await expect(screen.getByRole('heading', 'Welcome Back')).toBeVisible();
  await expect(screen.getByLabel('Email', { exact: true })).toBeVisible();
  await expect(screen.getByLabel('Password', { exact: true })).toBeVisible();
  await screen.getByRole('button', 'Login', { exact: true }).tap();
  await expect(screen.getByRole('alert')).toContainText('Please enter both email and password');
  await expect(browser).toHaveURL('/login');
  await app.screenshot('login-empty-submission');
});
