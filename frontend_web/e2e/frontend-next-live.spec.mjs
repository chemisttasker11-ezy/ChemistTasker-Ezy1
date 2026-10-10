import { test, expect } from '@playwright/test';
import { installApiFixture, roleUsers } from './support/apiFixture.mjs';
import { reviewApi } from './support/reviewFixture.mjs';

test('real Vite dashboard logo navigates to running Next public home', async ({ page }) => {
  const nextOrigin = process.env.EXPECTED_NEXT_ORIGIN;
  test.skip(process.env.CT_RUN_LIVE_NEXT !== '1' || !nextOrigin, 'Only run with live Next server in vite-to-next-live CI job');
  await installApiFixture(page, roleUsers.owner, (route, ctx) => reviewApi()(route, ctx));
  await page.goto('/dashboard/owner/overview?workspace=internal&pharmacy_id=101');
  const logo = page.getByRole('link', { name: 'ChemistTasker home', exact: true }).filter({ visible: true });
  await expect(logo).toHaveCount(1);
  expect(new URL(await logo.getAttribute('href'), page.url()).origin).toBe(new URL(nextOrigin).origin);
  await logo.click();
  await expect(page.locator('body')).toContainText('ChemistTasker');
  expect(new URL(page.url()).origin).toBe(new URL(nextOrigin).origin);
  expect(await page.title()).not.toBe('');
});
