import { test, expect } from '@playwright/test';
import { installApiFixture, json, roleUsers } from './support/apiFixture.mjs';

const membership = {
  id: 1011,
  pharmacyId: 101,
  pharmacyName: 'Smoke Pharmacy',
  pharmacy: { id: 101, name: 'Smoke Pharmacy' },
  role: 'OWNER',
  status: 'ACCEPTED',
};

const staffMember = {
  id: 702,
  membership_id: 702,
  pharmacyId: 101,
  role: 'PHARMACIST',
  user: { full_name: 'Test Pharmacist' },
  userDetails: { fullName: 'Test Pharmacist' },
  name: 'Test Pharmacist',
};

async function setupCalendar(page, { feedEvents = [], feedNotes = [], onPostEvent, onPostNote, onToggleNote } = {}) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const monthFrom = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthTo = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(lastDay)}`;

  let feedParams = null;
  await installApiFixture(page, roleUsers.owner);
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();

    if (path.includes('/my-memberships/')) {
      return json(route, [membership]);
    }
    if (path.includes('membership') || path.includes('/members')) {
      return json(route, [staffMember]);
    }
    if (path.includes('/calendar-feed/')) {
      feedParams = {
        pharmacy_id: url.searchParams.get('pharmacy_id'),
        date_from: url.searchParams.get('date_from'),
        date_to: url.searchParams.get('date_to'),
      };
      return json(route, { events: feedEvents, work_notes: feedNotes });
    }
    if (method === 'POST' && path.includes('/calendar-events/')) {
      return onPostEvent ? onPostEvent(route, req) : json(route, { id: 501, ...req.postDataJSON() }, 201);
    }
    if (method === 'POST' && path.includes('/work-notes/') && !path.includes('/mark_')) {
      return onPostNote ? onPostNote(route, req) : json(route, { ok: true, id: 601 });
    }
    if (method === 'POST' && path.includes('/work-notes/') && path.includes('/mark_')) {
      return onToggleNote ? onToggleNote(route, req, path) : json(route, { ok: true });
    }
    return route.fallback();
  });

  await page.goto('/dashboard/owner/calendar');
  await expect(page.getByRole('heading', { name: 'Pharmacy Calendar' })).toBeVisible();

  return { todayStr, monthFrom, monthTo, getFeedParams: () => feedParams };
}

test.describe('calendar wire interactions', () => {
  test('create recurring event capturing payload with null all-day times', async ({ page }) => {
    let capturedPayload = null;
    const { todayStr, monthFrom, monthTo, getFeedParams } = await setupCalendar(page, {
      onPostEvent: async (route, req) => {
        capturedPayload = req.postDataJSON();
        return json(route, { id: 501, ...capturedPayload }, 201);
      },
    });

    await expect.poll(() => getFeedParams()).toEqual({
      pharmacy_id: '101',
      date_from: monthFrom,
      date_to: monthTo,
    });

    await page.getByRole('button', { name: 'Add Event' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Clinical Governance Meeting');
    await page.getByLabel('Description').fill('Review audit logs');
    await page.getByLabel('Repeats').click();
    await page.getByRole('option', { name: 'Weekly' }).click();

    await page.getByRole('button', { name: 'Create Event' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();

    await expect.poll(() => capturedPayload).toEqual({
      pharmacy: 101,
      title: 'Clinical Governance Meeting',
      description: 'Review audit logs',
      date: todayStr,
      all_day: true,
      start_time: null,
      end_time: null,
      recurrence: {
        freq: 'WEEKLY',
        interval: 1,
        until_date: null,
      },
    });
  });

  test('create work note with booleans/assignees/recurrence and retain modal on backend 400', async ({ page }) => {
    let capturedPayload = null;
    const { todayStr } = await setupCalendar(page, {
      onPostNote: async (route, req) => {
        capturedPayload = req.postDataJSON();
        return json(route, { detail: 'Assigned staff is on leave' }, 400);
      },
    });

    await page.getByRole('button', { name: 'Add Work Note' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Dangerous Drug Safe Audit');
    await page.getByLabel('Details').fill('Reconcile DD register with physical stock');
    await page.getByLabel('Notify assignees at shift start').click();

    await page.getByLabel('Repeats').click();
    await page.getByRole('option', { name: 'Daily' }).click();

    await page.getByLabel('Assign to').click();
    await page.getByRole('option', { name: /Test Pharmacist/ }).click();
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Create Work Note' }).click();

    await expect.poll(() => capturedPayload).toEqual({
      pharmacy: 101,
      title: 'Dangerous Drug Safe Audit',
      body: 'Reconcile DD register with physical stock',
      date: todayStr,
      notify_on_shift_start: true,
      is_general: false,
      assignee_membership_ids: [702],
      recurrence: {
        freq: 'DAILY',
        interval: 1,
        until_date: null,
      },
    });

    await expect(page.getByRole('alert')).toContainText('Assigned staff is on leave');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Dangerous Drug Safe Audit');

    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Dangerous Drug Safe Audit (Escalated)');
    await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Dangerous Drug Safe Audit (Escalated)');
  });

  test('toggle existing recurring note capturing correct base ID and occurrence date', async ({ page }) => {
    let capturedTogglePath = null;
    let capturedTogglePayload = null;

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const noteDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    const { todayStr } = await setupCalendar(page, {
      feedNotes: [
        {
          id: 'occ-901',
          series_id: 42,
          is_occurrence: true,
          title: 'Daily Fridge Temp Log',
          date: noteDate,
          body: 'Log morning and afternoon temps',
          status: 'OPEN',
          assignees: [{ membership_id: 702, user_name: 'Test Pharmacist' }],
          completed_by: [],
        },
      ],
      onToggleNote: async (route, req, path) => {
        capturedTogglePath = path;
        capturedTogglePayload = req.postDataJSON();
        return json(route, { ok: true });
      },
    });

    await expect(page.getByText('Daily Fridge Temp Log')).toBeVisible();
    await page.getByRole('button', { name: 'Mark Done' }).click();

    await expect.poll(() => capturedTogglePayload).toEqual({
      occurrence_date: todayStr,
    });
    expect(capturedTogglePath).toContain('/work-notes/42/mark_done/');
  });
});
