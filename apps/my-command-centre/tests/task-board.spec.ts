import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('loads notebook tasks and navigation views', async ({ page }) => {
  await expect(page.getByText('One clear place for your work')).toBeVisible();
  await page.getByRole('button', { name: 'My task board' }).click();
  await expect(page.getByRole('heading', { name: /My task board/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tax', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Family time', exact: true })).toBeVisible();
});

test('creates, edits, moves and persists a task', async ({ page }) => {
  await page.getByRole('button', { name: 'New task' }).click();
  await page.getByRole('textbox', { name: 'Task name' }).fill('Review supplier proposal');
  await page.getByRole('combobox', { name: 'Area of life' }).selectOption('ChemistTasker');
  await page.getByRole('button', { name: 'Create task' }).click();
  await page.getByRole('button', { name: 'My task board' }).click();
  await expect(page.getByRole('button', { name: 'Review supplier proposal' })).toBeVisible();
  await page.getByRole('button', { name: 'More options for Review supplier proposal' }).click();
  await page.getByRole('button', { name: 'Weekly', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'My task board' }).click();
  const card = page.locator('[data-testid^="task-"]').filter({ hasText: 'Review supplier proposal' });
  await expect(card).toBeVisible();
  await expect(page.getByTestId('lane-weekly').locator('[data-testid^="task-"]').filter({ hasText: 'Review supplier proposal' })).toBeVisible();
});

test('recurring completion can be undone without duplicating a task', async ({ page }) => {
  await page.getByRole('button', { name: 'My task board' }).click();
  const card = page.locator('[data-testid^="task-"]').filter({ hasText: 'Family time' });
  await card.getByRole('button', { name: 'Complete Family time' }).click();
  await expect(card.getByRole('button', { name: 'Undo completion of Family time' })).toBeVisible();
  await card.getByRole('button', { name: 'Undo completion of Family time' }).click();
  await expect(card.getByRole('button', { name: 'Complete Family time' })).toBeVisible();
});

test('restores archived tasks', async ({ page }) => {
  await page.getByRole('button', { name: 'My task board' }).click();
  await page.getByRole('button', { name: 'More options for Tax' }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Archive task' }).click();
  await page.getByRole('button', { name: 'Archived tasks' }).click();
  await expect(page.getByText('Tax', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Restore', exact: true }).first().click();
  await expect(page.getByText('No archived tasks')).toBeVisible();
});

test('renders mobile navigation without horizontal page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('button', { name: 'My task board' }).click();
  await expect(page.getByRole('heading', { name: /My task board/ })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)).toBe(true);
});
