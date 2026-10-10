import { test, expect } from '@playwright/test';
import { installApiFixture, json, roleUsers } from './support/apiFixture.mjs';

test('dashboard search uses authorised navigation and preserves the selected pharmacy', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await installApiFixture(page, roleUsers.owner);
  await page.goto('/dashboard/owner/overview?workspace=internal&pharmacy_id=101');
  const search = page.getByPlaceholder('Search pages...');
  await search.fill('Timesheets');
  await page.getByRole('option', { name: 'Timesheets', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/workforce\/timesheets/);
  expect(new URL(page.url()).searchParams.get('pharmacy_id')).toBe('101');
});

test('a worker sees applications and recommendations as distinct work and opens the existing shift destination', async ({ page }) => {
  await installApiFixture(page, roleUsers.pharmacist, (route, { path }) => {
    if (path.endsWith('/dashboard/pharmacist/')) return json(route, {
      shifts: [{ id: 81, pharmacy_name: 'Application Pharmacy', date: '2030-10-31', status: 'Interested' }],
      recommended_shifts: [{ id: 82, pharmacy_name: 'Suggested Pharmacy', date: '2030-11-01', status: 'Recommended', reason: 'Matches your availability and travel area' }],
    });
  });
  await page.goto('/dashboard/pharmacist/overview?workspace=internal&pharmacy_id=101');
  await expect(page.getByText('My next shifts', { exact: true })).toBeVisible();
  await expect(page.getByText('Interested', { exact: true })).toBeVisible();
  await expect(page.getByText('Recommended for you', { exact: true })).toBeVisible();
  await expect(page.getByText('Matches your availability and travel area', { exact: true })).toBeVisible();
  await page.getByText('Application Pharmacy', { exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/pharmacist\/shifts\/81/);
});


test('a worker cannot find owner-only pages through dashboard search', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await installApiFixture(page, roleUsers.otherstaff);
  await page.goto('/dashboard/otherstaff/overview?workspace=internal&pharmacy_id=101');
  await page.getByPlaceholder('Search pages...').fill('Manage Pharmacies');
  await expect(page.getByRole('option', { name: 'Manage Pharmacies', exact: true })).toHaveCount(0);
  await page.keyboard.press('Enter');
  expect(new URL(page.url()).pathname).toBe('/dashboard/otherstaff/overview');
});
