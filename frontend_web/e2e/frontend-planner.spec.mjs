import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const screenshots = fileURLToPath(new URL('../../docs/planner/screenshots/after/', import.meta.url));
mkdirSync(screenshots, { recursive: true });
import { test, expect } from '@playwright/test';
import { installApiFixture, json, roleUsers } from './support/apiFixture.mjs';

async function plannerFixture(page, user = roleUsers.owner) {
  const state = { notes: [], saved: [], copies: [], feeds: [], writes: [], roster: [], completions: [] };
  let nextId = 10;
  const shiftDate = (day, offset) => {
    const date = new Date(`${day}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  };
  const note = (body, id = nextId++) => ({ id, pharmacy: 101, date: '2026-12-28', title: '', body: '',
    status: 'open', is_planner_task: true, is_clinical: false, start_time: null, end_time: null,
    notify_on_shift_start: false, is_general: false, recurrence: null, assignees: [], completed_count: 0,
    completed_by: [], created_by: 1, created_by_name: 'Owner', created_at: '2026-12-01T00:00:00Z',
    updated_at: '2026-12-01T00:00:00.123456Z', ...body });
  state.notes.push(note({ title: 'Repeating opening', is_clinical: true, assignees: [{ id: 702, membership_id: 702, user_id: roleUsers.pharmacist.id, user_name: 'Alex Worker' }], recurrence: { freq: 'WEEKLY', byweekday: [0, 2] } }, 1));
  await installApiFixture(page, user, async (route, { path, method, url }) => {
    const body = () => route.request().postDataJSON();
    if (path.endsWith('/pharmacies/')) return json(route, [{ id: 101, name: 'Smoke Pharmacy' }]);
    if (path.endsWith('/operation-context/')) return json(route, { pharmacies: user.role === 'OWNER' ? [{ id: 101, name: 'Smoke Pharmacy', organization_id: null }] : [] });
    if (path.includes('/memberships/')) return json(route, [{ id: 702, pharmacy: 101, user: 4, user_details: { first_name: 'Alex', last_name: 'Worker' }, role: 'PHARMACIST', is_active: true, status: 'ACCEPTED' }]);
    if (path.endsWith('/calendar-feed/')) {
      const from = url.searchParams.get('date_from'), to = url.searchParams.get('date_to');
      state.feeds.push({ from, to });
      const notes = state.notes.flatMap(n => {
        if (!n.recurrence) return n.date >= from && n.date <= to ? [{ ...n, series_date: n.date }] : [];
        const occurrences = [];
        for (let date = from; date <= to; date = shiftDate(date, 1)) {
          const weekday = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
          if (date >= n.date && n.recurrence.byweekday.includes(weekday)) occurrences.push({ ...n, id: `${n.id}-${date}`, date, series_id: n.id, series_date: n.date, occurrence_date: date, is_occurrence: true });
        }
        return occurrences;
      });
      return json(route, { events: [], work_notes: notes, date_from: from, date_to: to, pharmacy_id: 101, organization_id: null });
    }
    if (path.endsWith('/work-notes/') && method === 'POST') {
      const input = body(); state.writes.push(input);
      const created = note({ ...input, assignees: (input.assignee_membership_ids ?? []).map(id => ({ id, membership_id: id, user_id: 4, user_name: 'Alex Worker', created_at: '', notified_at: null })) });
      state.notes.push(created); return json(route, created, 201);
    }
    const detail = path.match(/\/work-notes\/(\d+)\/$/);
    if (detail) {
      const id = Number(detail[1]); const task = state.notes.find(n => n.id === id);
      if (method === 'DELETE') {
        expect(body().updated_at).toBe(task.updated_at);
        state.notes = state.notes.filter(n => n.id !== id);
        await route.fulfill({ status: 204 }); return true;
      }
      if (method === 'PATCH') {
        expect(body().updated_at).toBe(task.updated_at);
        state.writes.push(body()); Object.assign(task, body(), { updated_at: '2026-12-02T00:00:00.123456Z' });
      }
      return json(route, task);
    }
    const completion = path.match(/\/work-notes\/(\d+)\/(mark_done|mark_open)\/$/);
    if (completion) {
      const task = state.notes.find(n => n.id === Number(completion[1]));
      state.completions.push(body());
      task.status = completion[2] === 'mark_done' ? 'done' : 'open';
      return json(route, task);
    }
    if (path.endsWith('/planner-copy/')) {
      const input = body(); state.copies.push(input);
      expect(input.request_key).toBeTruthy(); expect(input.pharmacy).toBe(101);
      const source = state.notes.filter(n => n.date >= input.source_from && n.date <= input.source_to && (!input.task_id || n.id === input.task_id));
      const skipped = source.filter(n => n.recurrence && !input.task_id).length;
      const created = source.filter(n => !n.recurrence || input.task_id).map(n => note({ ...n, id: nextId++, date: shiftDate(n.date, input.day_offset), recurrence: null, completed_count: 0, completed_by: [] }));
      state.notes.push(...created);
      return json(route, { created: created.length, task_ids: created.map(n => n.id), skipped_series: skipped,
        dropped_assignees: input.day_offset ? [{ task_id: 1, membership_id: 999, name: 'Former worker' }] : [] });
    }
    if (path.endsWith('/planner-roster-fill/')) { state.roster.push(body()); return json(route, { assignee_membership_ids: [702] }); }
    if (path.endsWith('/saved-tasks/')) {
      if (method === 'POST') { const task = { ...body(), id: nextId++ }; state.saved.push(task); return json(route, task, 201); }
      return json(route, state.saved);
    }
    if (/\/saved-tasks\/\d+\/$/.test(path) && method === 'DELETE') {
      state.saved = state.saved.filter(s => s.id !== Number(path.split('/').at(-2)));
      await route.fulfill({ status: 204 }); return true;
    }
  });
  return state;
}

for (const viewport of [{ width: 1440, height: 960 }, { width: 390, height: 844 }]) {
  test(`Calendar Plan: add, duplicate, copy, edit, delete and reusable tasks at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const state = await plannerFixture(page);
    await page.goto('/dashboard/owner/calendar?workspace=internal&pharmacy_id=101&date=2026-12-28');
    await page.getByRole('tab', { name: 'Plan', exact: true }).click();
    await expect.poll(() => state.feeds.at(-1)).toEqual({ from: '2026-12-28', to: '2027-01-03' });
    await expect(page.getByRole('link', { name: 'Operations Planner', exact: true })).toHaveCount(0);
    if (viewport.width > 1000) await expect(page.getByRole('region')).toHaveCount(7);
    else await expect(page.getByRole('button', { name: 'Next day', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Add task', exact: true }).first().click();
    let dialog = page.getByRole('dialog', { name: 'Add task', exact: true });
    await dialog.getByRole('textbox', { name: 'Title', exact: true }).fill('Opening task');
    await page.screenshot({ path: `${screenshots}/add-task-${viewport.width}.png`, fullPage: true, animations: 'disabled' });
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(state.writes[0]).toMatchObject({ date: '2026-12-28', is_planner_task: true, assignee_membership_ids: [], notify_on_shift_start: false });
    expect(new URL(page.url()).searchParams.get('date')).toBe('2026-12-28');
    let task = page.getByRole('article', { name: 'Opening task', exact: true });
    await expect(task).toHaveCount(1);
    await expect(task.getByText('0 of 0 done')).toBeVisible();
    await task.getByRole('button', { name: 'More actions for Opening task', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Duplicate', exact: true }).click();
    await expect(task).toHaveCount(2);
    expect(state.copies.at(-1)).toMatchObject({ source_from: '2026-12-28', source_to: '2026-12-28', day_offset: 0, task_id: state.notes.find(n => n.title === 'Opening task').id });
    await page.getByRole('button', { name: 'Day actions for Monday 28 December', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Copy day to tomorrow', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: '2 copied; 1 repeating skipped; 1 people dropped: Former worker.' })).toBeVisible();
    expect(state.copies.at(-1)).toMatchObject({ source_from: '2026-12-28', source_to: '2026-12-28', day_offset: 1 });
    await page.getByRole('button', { name: 'Copy week to next week', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: '4 copied; 1 repeating skipped' })).toBeVisible();
    expect(state.copies.at(-1)).toMatchObject({ source_from: '2026-12-28', source_to: '2027-01-03', day_offset: 7 });
    expect(state.notes.filter(n => n.date === '2027-01-04' && n.title === 'Opening task')).toHaveLength(2);
    expect(state.notes.filter(n => n.date === '2027-01-05' && n.title === 'Opening task')).toHaveLength(2);

    await task.first().getByRole('button', { name: 'Edit Opening task', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Edit task', exact: true });
    await dialog.getByRole('textbox', { name: 'Title', exact: true }).fill('Edited opening');
    await dialog.getByRole('button', { name: 'More options', exact: true }).click();
    await dialog.getByLabel('Details', { exact: true }).fill('Reusable instructions');
    await page.screenshot({ path: `${screenshots}/edit-task-${viewport.width}.png`, fullPage: true, animations: 'disabled' });
    await dialog.getByRole('button', { name: 'Save as reusable', exact: true }).click();
    await expect.poll(() => state.saved.length).toBe(1);
    expect(state.saved[0]).not.toHaveProperty('recurrence');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('article', { name: 'Edited opening', exact: true })).toHaveCount(1);
    await page.getByRole('button', { name: 'Add task', exact: true }).first().click();
    dialog = page.getByRole('dialog', { name: 'Add task', exact: true });
    await dialog.getByLabel('Use a saved task', { exact: true }).click();
    await page.getByRole('option', { name: 'Edited opening', exact: true }).click();
    await expect(dialog.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Edited opening');
    await dialog.getByRole('textbox', { name: 'Title', exact: true }).fill('Placed reusable');
    await dialog.getByRole('button', { name: 'Fill from roster', exact: true }).click();
    await expect.poll(() => state.roster.length).toBe(1);
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('article', { name: 'Placed reusable', exact: true })).toBeVisible();
    expect(state.writes.at(-1)).toMatchObject({ body: 'Reusable instructions', date: '2026-12-28', assignee_membership_ids: [702], recurrence: null });

    await page.getByRole('article', { name: 'Edited opening', exact: true }).getByRole('button', { name: 'More actions for Edited opening', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
    const confirm = page.getByRole('dialog', { name: 'Delete task?', exact: true });
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText('Edited opening');
    await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByRole('article', { name: 'Edited opening', exact: true })).toHaveCount(0);
    await expect(page.getByRole('article', { name: 'Placed reusable', exact: true })).toBeVisible();

    // A saved-task delete asks for confirmation and cannot remove placed tasks.
    await page.getByRole('button', { name: 'Add task', exact: true }).first().click();
    dialog = page.getByRole('dialog', { name: 'Add task', exact: true });
    await dialog.getByLabel('Use a saved task', { exact: true }).click();
    await page.getByRole('option', { name: 'Edited opening', exact: true }).click();
    await dialog.getByRole('button', { name: 'Delete saved task', exact: true }).click();
    await page.getByRole('dialog', { name: 'Delete saved task?', exact: true }).getByRole('button', { name: 'Delete', exact: true }).click();
    await expect.poll(() => state.saved.length).toBe(0);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByRole('article', { name: 'Placed reusable', exact: true })).toBeVisible();
    await page.mouse.move(0, 0);
    await page.screenshot({ path: `${screenshots}/planner-${viewport.width}.png`, fullPage: true, animations: 'disabled' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const target = await page.getByRole('article', { name: 'Placed reusable', exact: true }).boundingBox();
    if (viewport.width < 1000) expect(target.y).toBeLessThan(viewport.height);
  });
}

test('editing an occurrence uses the original series start and preserves weekdays', async ({ page }) => {
  const state = await plannerFixture(page);
  await page.goto('/dashboard/owner/calendar?workspace=internal&pharmacy_id=101&date=2026-12-30');
  await page.getByRole('tab', { name: 'Plan', exact: true }).click();
  const wednesday = page.getByRole('region', { name: 'Wednesday 30 December', exact: true });
  await wednesday.getByRole('article', { name: 'Repeating opening', exact: true }).getByRole('button', { name: 'Edit Repeating opening', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit task', exact: true });
  await expect(dialog.getByLabel('Date', { exact: true })).toHaveValue('2026-12-28');
  await dialog.getByRole('textbox', { name: 'Title', exact: true }).fill('Edited series');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.writes.at(-1)).toMatchObject({ date: '2026-12-28', recurrence: { freq: 'WEEKLY', byweekday: [0, 2] } });
  expect(new URL(page.url()).searchParams.get('date')).toBe('2026-12-30');
});

test('staff see To do / Done, can tick their occurrence and have no planner mutations', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await plannerFixture(page, roleUsers.pharmacist);
  await page.goto('/dashboard/pharmacist/calendar?workspace=internal&pharmacy_id=101&date=2026-12-28');
  await page.getByRole('tab', { name: 'Plan', exact: true }).click();
  const task = page.getByRole('article', { name: 'Repeating opening', exact: true });
  await expect(task.getByText('To do', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add task', exact: true })).toHaveCount(0);
  await expect(task.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
  await expect(task.getByRole('button', { name: 'Duplicate', exact: true })).toHaveCount(0);
  await task.getByRole('button', { name: 'Mark done', exact: true }).click();
  await expect(task.getByText('Done', { exact: true })).toBeVisible();
  expect(state.completions.at(-1)).toEqual({ occurrence_date: '2026-12-28', updated_at: '2026-12-01T00:00:00.123456Z' });
  await task.getByRole('button', { name: 'Mark to do', exact: true }).click();
  await expect(task.getByText('To do', { exact: true })).toBeVisible();
});


for (const viewport of [{ width: 1440, height: 960 }, { width: 390, height: 844 }]) {
  test(`empty week has one empty state at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const state = await plannerFixture(page);
    state.notes = [];
    await page.goto('/dashboard/owner/calendar?workspace=internal&pharmacy_id=101&date=2026-12-28');
    await page.getByRole('tab', { name: 'Plan', exact: true }).click();
    await expect(page.getByText('No tasks this week.', {exact: true})).toBeVisible();
    await expect(page.getByRole('region')).toHaveCount(0);
    await expect(page.getByText(/Save a task as reusable/)).toBeVisible();
    await page.screenshot({path: `${screenshots}/empty-week-${viewport.width}.png`, fullPage: true, animations: 'disabled'});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('button', {name: 'Add task', exact: true}).last().click();
    await expect(page.getByRole('dialog', {name: 'Add task', exact: true})).toBeVisible();
  });
}
