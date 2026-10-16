import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('weekly planner supports explicit commitments and weighted status scores', async ({ page }) => {
  await page.getByRole('button', { name: 'Week planner' }).click();
  await expect(page.getByRole('heading', { name: 'Plan your week' })).toBeVisible();
  await expect(page.getByText('Not scored')).toBeVisible();
  await page.getByRole('button', { name: /Add task on/ }).first().click();
  await page.getByRole('textbox', { name: 'Task name' }).fill('Review release');
  await page.getByRole('button', { name: 'Create task' }).click();
  await page.getByRole('button', { name: 'Add to plan' }).first().click();
  await expect(page.getByText('0/100')).toBeVisible();
  await page.getByRole('button', { name: 'Review release' }).first().click();
  await page.getByRole('combobox', { name: 'Task status' }).selectOption('progressing');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('60/100')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Week planner' }).click();
  await expect(page.getByText('60/100')).toBeVisible();
  await page.getByRole('button', { name: 'Save weekly review' }).click();
  await expect(page.getByText(/Review saved/)).toBeVisible();
});

test('today view limits focus choices to three without marking tasks completed', async ({ page }) => {
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: /Add .* to today's top three/ }).first().click();
  await expect(page.getByText('3/3 selected')).toBeVisible();
  await expect(page.getByRole('button', { name: /Add .* to today's top three/ }).first()).toBeDisabled();
  await page.getByRole('button', { name: /Remove .* from today's top three/ }).first().click();
  await expect(page.getByText('2/3 selected')).toBeVisible();
});
