import { test, expect } from '@playwright/test';
import { installApiFixture, json, roleUsers } from './support/apiFixture.mjs';
import { reviewApi, reviewInvoice } from './support/reviewFixture.mjs';

test('dashboard community stays in Vite with public community enabled and uses the scoped hub APIs', async ({ page }) => {
  const calls = [];
  await installApiFixture(page, { ...roleUsers.pharmacist, public_community_enabled: true }, async (route, ctx) => {
    if (ctx.path.includes('/hub/posts/') || ctx.path.includes('/hub/polls/')) calls.push({ path: ctx.path, params: Object.fromEntries(ctx.url.searchParams) });
    return reviewApi()(route, ctx);
  });
  await page.goto('/dashboard/pharmacy-hub?scope=platform&platform_hub=public');
  await expect(page.getByRole('heading', { name: 'Everyone Hub', exact: true })).toBeVisible();
  await expect.poll(() => calls.length).toBeGreaterThanOrEqual(2);
  expect(new URL(page.url()).pathname).toBe('/dashboard/pharmacy-hub');
  for (const call of calls) expect(call.params).toMatchObject({ scope: 'platform', platform_hub: 'public' });
  expect(calls.some(call => call.path === '/api/v1/hub/posts/')).toBe(true);
  expect(calls.some(call => call.path === '/api/v1/hub/polls/')).toBe(true);
});

for (const width of [390, 1440]) test(`shell logo opens the public home at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 960 });
  await installApiFixture(page, roleUsers.pharmacist);
  await page.goto('/dashboard/pharmacist/invoice');
  const home = page.getByRole('link', { name: 'ChemistTasker home', exact: true }).filter({ visible: true });
  await expect(home).toHaveCount(1);
  const destination = await home.getAttribute('href');
  expect(new URL(destination, page.url()).pathname).toBe('/');
  expect(destination).not.toContain('/dashboard');
  await page.route('**/*', async route => {
    if (route.request().isNavigationRequest() && new URL(route.request().url()).pathname === '/')
      return route.fulfill({ contentType: 'text/html', body: '<h1>Public home destination</h1>' });
    return route.fallback();
  });
  await home.click();
  await expect(page.getByRole('heading', { name: 'Public home destination' })).toBeVisible();
});

test('payroll switch preserves pharmacy ID and the existing PATCH payload', async ({ page }) => {
  const writes = [];
  await installApiFixture(page, roleUsers.owner, async (route, ctx) => {
    if (ctx.path.endsWith('/workforce/payroll-configuration/') && ctx.method === 'PATCH') {
      const body = route.request().postDataJSON(); writes.push(body);
      return json(route, body);
    }
    return reviewApi()(route, ctx);
  });
  await page.goto('/dashboard/owner/overview?workspace=internal&pharmacy_id=101&view=pharmacy&pharmacyId=101&tab=settings');
  const toggle = page.getByLabel('Use ChemistTasker Payroll', { exact: true });
  await expect(toggle).toBeEnabled(); await toggle.click();
  await expect(toggle).toBeChecked();
  expect(writes).toEqual([{ pharmacy_id: 101, use_chemisttasker_payroll: true }]);
});

test('an approved invoice whose list refresh fails reports the saved change and closes the action', async ({ page }) => {
  let changed = false; const writes = [];
  await installApiFixture(page, roleUsers.owner, async (route, ctx) => {
    if (ctx.path.endsWith('/finance/received-invoices/41/approve-payment/')) {
      changed = true; writes.push(route.request().postDataJSON()); return json(route, {});
    }
    if (changed && ctx.path.endsWith('/finance/received-invoices/')) return json(route, { detail: 'Refresh temporarily unavailable' }, 503);
    return reviewApi()(route, ctx);
  });
  await page.goto('/dashboard/owner/invoice?invoice=41');
  await page.getByRole('button', { name: 'Approve for payment', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Approve INV-0041 for payment?', exact: true });
  await dialog.getByRole('button', { name: 'Approve for payment', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('alert').filter({ hasText: "The change was saved, but the list didn't refresh" }).first()).toBeVisible();
  expect(writes).toEqual([{ version: 1, note: '' }]);
});

for (const width of [390, 1440]) for (const kind of ['invoice', 'super_request']) {
  test(`received ${kind} mark-paid requires the right confirmation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    const writes = [];
    const fallback = reviewApi();
    await installApiFixture(page, roleUsers.owner, async (route, ctx) => {
      if (ctx.path.endsWith('/finance/received-invoices/')) {
        return json(route, { results: [{ ...reviewInvoice, kind }], count: 1, next: null, previous: null });
      }
      if (ctx.path.endsWith('/finance/received-invoices/41/mark-paid/')) {
        const body = route.request().postDataJSON();
        writes.push(body);
        return json(route, {}, kind === 'super_request' && body.fund_payment_confirmed !== true ? 400 : 200);
      }
      return fallback(route, ctx);
    });
    await page.goto('/dashboard/owner/invoice?invoice=41');
    await page.getByRole('button', { name: 'Mark as paid', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Mark INV-0041 as paid?', exact: true });
    const save = dialog.getByRole('button', { name: 'Mark as paid', exact: true });
    const confirmation = dialog.getByRole('checkbox', { name: 'I confirm this payment went to the super fund' });
    if (kind === 'super_request') {
      await expect(save).toBeDisabled();
      expect(writes).toEqual([]);
      await confirmation.check();
      await expect(save).toBeEnabled();
    } else {
      await expect(confirmation).toHaveCount(0);
      await expect(save).toBeEnabled();
    }
    await save.click();
    await expect(dialog).toHaveCount(0);
    expect(writes).toEqual([{ version: 1, note: '', ...(kind === 'super_request' ? { fund_payment_confirmed: true } : {}) }]);
    if (kind === 'super_request') {
      await page.getByRole('button', { name: 'Mark as paid', exact: true }).click();
      await expect(confirmation).not.toBeChecked();
      await expect(save).toBeDisabled();
    }
  });
}
