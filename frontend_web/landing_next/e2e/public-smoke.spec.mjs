import { test, expect } from '@playwright/test';

const publicRoutes = [
  '/',
  '/pricing',
  '/pricing/organization',
  '/privacy-policy',
  '/terms-of-service',
  '/contact',
  '/account-deletion',
  '/learning',
  '/marketplace',
];

for (const route of publicRoutes) {
  test(`public route renders: ${route}`, async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.route('**/api/**', async (requestRoute) => {
      await requestRoute.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ results: [], count: 0, next: null, previous: null }),
      });
    });

    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
    expect(response?.status() ?? 200).toBeLessThan(500);
    await expect(page.locator('body')).toBeVisible();
    await expect(page.locator('body')).not.toBeEmpty();
    await expect(page.locator('body')).not.toContainText('Application error');
    expect(pageErrors, `page errors while opening ${route}`).toEqual([]);
  });
}
