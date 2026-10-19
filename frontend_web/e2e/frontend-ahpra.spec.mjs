import { test, expect } from '@playwright/test';
import { installApiFixture, json, roleUsers } from './support/apiFixture.mjs';
import { reviewApi } from './support/reviewFixture.mjs';

test('a pending first check polls for five minutes and refreshes on foreground afterward', async ({ page }) => {
  await page.clock.install();
  let checks = 0;
  let state = 'pending';
  const chat = reviewApi();
  await installApiFixture(page, roleUsers.pharmacist, (route, ctx) => {
    if (ctx.path.includes('/onboarding/')) {
      checks += 1;
      return json(route, { ahpra: { state, frozen: state === 'suspended', attempts: 0, recheck_available_at: null } });
    }
    return chat(route, ctx);
  });
  await page.goto('/dashboard/pharmacist/chat?conversationId=11');
  await expect(page.getByText('A message for the team', { exact: true }).first()).toBeVisible();
  await page.waitForLoadState('networkidle');
  const initialChecks = checks;
  for (let tick = 1; tick <= 20; tick += 1) {
    await page.clock.runFor(15000);
    await expect.poll(() => checks).toBe(initialChecks + tick);
  }
  await page.clock.runFor(60000);
  expect(checks).toBe(initialChecks + 20);
  state = 'suspended';
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByText('Account Access Paused', { exact: true })).toBeVisible();
  expect(checks).toBe(initialChecks + 21);
});

for (const action of ['accept', 'reject']) {
  test(`membership ${action} refreshes AHPRA without changing identity`, async ({ page }) => {
    let responded = false;
    let checks = 0;
    await installApiFixture(page, roleUsers.pharmacist, (route, { path }) => {
      if (path.includes('/onboarding/')) {
        checks += 1;
        return json(route, { ahpra: { state: 'not_found', frozen: !responded, attempts: 0 } });
      }
      if (path.endsWith(`/my-memberships/702/${action}/`)) {
        responded = true;
        return json(route, { ok: true });
      }
      if (path.endsWith('/my-memberships/')) return json(route, [{ id: 702, role: 'PHARMACIST', status: responded ? 'ACCEPTED' : 'PENDING', pharmacy_detail: { id: 101, name: 'Smoke Pharmacy' } }]);
      return undefined;
    });
    await page.goto('/dashboard/pharmacist/memberships');
    await page.waitForLoadState('networkidle');
    const initialChecks = checks;
    await page.getByRole('button', { name: action === 'accept' ? 'Accept' : 'Decline', exact: true }).click();
    await expect.poll(() => checks).toBeGreaterThan(initialChecks);
    await page.getByRole('button', { name: 'Chat', exact: true }).click();
    await expect(page).toHaveURL(/\/chat/);
    await expect(page.getByText('Messages', { exact: true })).toBeVisible();
    await expect(page.getByText('Account Access Paused', { exact: true })).toHaveCount(0);
  });
}
