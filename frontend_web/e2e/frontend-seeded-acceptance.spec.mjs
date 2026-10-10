import { test, expect } from '@playwright/test';
import { installApiFixture, json } from './support/apiFixture.mjs';

test('seeded Next login preserves the return destination and real candidate work profiles', async ({ page }) => {
  test.skip(process.env.CT_RUN_SEEDED_STACK !== '1', 'Requires the disposable seeded backend and live Next/Vite servers.');
  test.setTimeout(120_000);
  let serializedInterests;
  page.on('response', async response => {
    if (response.url().includes('/shift-interests/') && response.status() === 200) serializedInterests = await response.json();
  });
  const next = process.env.CT_SEEDED_NEXT_ORIGIN;
  const destination = '/dashboard/owner/shift-center/active?workspace=internal&pharmacy_id=1';
  await page.goto(`${next}/login?next=${encodeURIComponent(destination)}`);
  await page.getByLabel('Email', { exact: true }).fill(process.env.CT_SEEDED_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(process.env.CT_SEEDED_PASSWORD);
  const login = page.waitForResponse(response => response.url().includes('/users/login/') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  expect((await login).status()).toBe(200);
  await page.waitForURL(url => url.origin === process.env.CT_SEEDED_VITE_ORIGIN && url.pathname === '/dashboard/owner/shift-center/active');
  expect(new URL(page.url()).searchParams.get('pharmacy_id')).toBe('1');
  expect(new URL(page.url()).searchParams.get('workspace')).toBe('internal');
  const refresh = (await page.context().cookies()).find(cookie => cookie.name === 'ct_refresh');
  expect(refresh?.httpOnly).toBe(true);
  await page.getByRole('button', { name: 'Manage candidates', exact: true }).click();
  await expect.poll(() => Boolean(serializedInterests)).toBe(true);
  const payload = serializedInterests;
  const interests = payload.results ?? payload;
  const hassan = interests.find(interest => interest.user_detail?.first_name === 'Hassan');
  expect(hassan.user_detail.role_label).toBe('Pharmacy Student');
  expect(hassan.user_detail.skills).toContain('VACCINATION');
  expect(hassan.user_detail).not.toHaveProperty('email');
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Hassan Haddad', { exact: true })).toBeVisible();
  await expect(dialog.getByText(/Pharmacy Student/)).toBeVisible();
  await expect(dialog.getByText('ID verified', { exact: true })).toBeVisible();
  await expect(dialog.getByText('3 years experience', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Review offer', exact: true }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Counter Haddad', { exact: true })).toBeVisible();
  await expect(dialog.getByText(/Pharmacy Student/)).toBeVisible();
  await expect(dialog.getByText('ID verified', { exact: true })).toBeVisible();
  await expect(dialog.getByText('3 years experience', { exact: true })).toBeVisible();
  await expect(dialog.getByText(/Bendigo, VIC/)).toBeVisible();
});


test('Next public board preserves server ranking and sends organisation, search, role and urgency filters', async ({ page }) => {
  test.skip(process.env.CT_RUN_SEEDED_STACK !== '1', 'Requires a live isolated Next server.');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1080 });
  const calls = [];
  const shifts = [
    ['Server First Pharmacy', 91, '2030-11-05'],
    ['Server Second Pharmacy', 92, '2030-11-01'],
  ].map(([name, id, date]) => ({ id, role_needed: 'PHARMACIST', role_label: 'Pharmacist', employment_type: 'LOCUM', visibility: 'PLATFORM', pharmacy_detail: { id, name, suburb: 'Bendigo', state: 'VIC' }, slots: [{ id, date, start_time: '09:00', end_time: '15:00', rate: 80 }] }));
  await installApiFixture(page, null, (route, { path, url }) => {
    if (path.endsWith('/public-job-board/')) {
      calls.push(Object.fromEntries(url.searchParams));
      return json(route, { results: shifts, count: 2, next: null, previous: null });
    }
  });
  await page.goto(`${process.env.CT_SEEDED_NEXT_ORIGIN}/shifts/public-board?organization=17`);
  await expect(page.getByText(/^Server (?:First|Second) Pharmacy$/)).toHaveText(['Server First Pharmacy', 'Server Second Pharmacy']);
  await page.getByPlaceholder('Role, pharmacy or suburb').fill('Bendigo');
  await page.getByRole('checkbox', { name: 'Urgent shifts only' }).check();
  await page.getByRole('checkbox', { name: 'Pharmacist', exact: true }).check();
  await expect.poll(() => calls.some(call => call.organization === '17' && call.search === 'Bendigo' && call.only_urgent === 'true' && call.roles === 'PHARMACIST')).toBe(true);
});
