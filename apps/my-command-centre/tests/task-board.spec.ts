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

test('duplicates a task into an independently editable new task', async ({ page }) => {
  await page.getByRole('button', { name: 'My task board' }).click();
  await page.getByRole('button', { name: 'More options for Tax' }).click();
  await page.getByRole('button', { name: 'Duplicate & edit' }).click();
  await expect(page.getByRole('heading', { name: 'Duplicate task' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Task name' }).fill('Personal tax paperwork copy');
  await page.getByRole('button', { name: 'Create copy' }).click();
  await expect(page.getByRole('button', { name: 'Personal tax paperwork copy', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tax', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'My task board' }).click();
  await expect(page.getByRole('button', { name: 'Personal tax paperwork copy', exact: true })).toBeVisible();
});

test('sets simple progress and postpones to a later date', async ({ page }) => {
  await page.getByRole('button', { name: 'My task board' }).click();
  const card = page.locator('[data-testid="task-notebook-1"]');
  await card.getByRole('combobox', { name: 'Status for Tax' }).selectOption('started');
  await expect(card.getByRole('combobox', { name: 'Status for Tax' })).toHaveValue('started');
  await card.getByRole('combobox', { name: 'Status for Tax' }).selectOption('progressing');
  await expect(card.getByRole('combobox', { name: 'Status for Tax' })).toHaveValue('progressing');
  await card.getByRole('combobox', { name: 'Status for Tax' }).selectOption('postponed');
  const date = await page.evaluate(() => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Brisbane', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    return new Date(`${today}T12:00:00Z`).getTime() + 7 * 86400000;
  });
  const postponedTo = new Date(date).toISOString().slice(0, 10);
  await card.getByLabel('New date for Tax').fill(postponedTo);
  await card.getByRole('button', { name: 'Move', exact: true }).click();
  await expect(card.getByRole('combobox', { name: 'Status for Tax' })).toHaveValue('postponed');
  await page.reload();
  await page.getByRole('button', { name: 'My task board' }).click();
  await expect(page.locator('[data-testid="task-notebook-1"]').getByRole('combobox', { name: 'Status for Tax' })).toHaveValue('postponed');
});

test('calendar supports day/week/month/year, adding, editing and unscheduling', async ({ page }) => {
  const today = await page.evaluate(() => {
    const p = new Intl.DateTimeFormat('en-AU', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Australia/Brisbane' }).formatToParts(new Date());
    const val = (type: string) => p.find(item => item.type === type)?.value;
    return `${val('year')}-${val('month')}-${val('day')}`;
  });
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Calendar/ })).toBeVisible();
  for (const scale of ['Day', 'Week', 'Month', 'Year']) {
    await page.getByRole('button', { name: scale, exact: true }).click();
    await expect(page.getByRole('button', { name: scale, exact: true })).toHaveAttribute('aria-pressed', 'true');
  }
  await page.getByRole('button', { name: 'Month', exact: true }).click();
  await page.getByRole('button', { name: `Add task on ${today}` }).click();
  await page.getByRole('textbox', { name: 'Task name' }).fill('Calendar smoke test');
  await page.getByRole('combobox', { name: 'Repeat' }).selectOption('none');
  await page.getByRole('button', { name: 'Create task' }).click();
  const day = page.getByTestId(`calendar-date-${today}`);
  await expect(day.getByRole('button', { name: /Calendar smoke test/ })).toBeVisible();
  await day.getByRole('button', { name: /Calendar smoke test/ }).click();
  await page.getByRole('textbox', { name: 'Task name' }).fill('Calendar smoke test edited');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.getByRole('button', { name: 'Week', exact: true }).click();
  await page.getByRole('button', { name: 'Remove Calendar smoke test edited from calendar' }).click();
  await expect(page.getByRole('button', { name: 'Schedule Calendar smoke test edited' })).toBeVisible();
  await page.getByRole('button', { name: 'My task board' }).click();
  await expect(page.getByRole('button', { name: 'Calendar smoke test edited' })).toBeVisible();
});
