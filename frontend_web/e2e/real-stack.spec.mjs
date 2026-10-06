import { test, expect } from '@playwright/test';

test('real Next login hands off to Vite and preserves the canonical Django session', async ({ page }) => {
  await page.goto('/login');

  await expect(page.getByText('Welcome Back', { exact: false })).toBeVisible();
  await page.getByLabel('Email').fill('f07-web@example.test');
  await page.getByLabel('Password').fill('F07WebStack1234!');

  const loginResponse = page.waitForResponse(
    response =>
      response.url().includes('/api/platform/users/login/') &&
      response.request().method() === 'POST',
  );

  await page.getByRole('button', { name: 'Login' }).click();
  expect((await loginResponse).status()).toBe(200);

  await page.waitForURL(/\/dashboard\/pharmacist\/overview(?:[/?#]|$)/, { timeout: 30_000 });
  await expect(page.locator('body')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Page not found');
  await expect(page.locator('body')).not.toContainText('Application error');

  await expect
    .poll(async () => page.locator('script[src^="/js/"]').count(), { timeout: 15_000 })
    .toBeGreaterThan(0);

  const proof = await page.evaluate(async () => {
    const get = async (url) => {
      const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
      return { status: response.status, body: await response.json().catch(() => ({})) };
    };
    return {
      canonical: await get('/api/v1/users/me/'),
      platform: await get('/api/platform/users/me/'),
      appConfig: await get('/api/v1/users/mobile/app-config/'),
    };
  });

  expect(proof.canonical.status).toBe(200);
  expect(proof.platform.status).toBe(200);
  expect(proof.appConfig.status).toBe(200);
  expect(proof.canonical.body.email).toBe('f07-web@example.test');
  expect(proof.platform.body.email).toBe('f07-web@example.test');
  expect(proof.canonical.body.role).toBe('PHARMACIST');
});
