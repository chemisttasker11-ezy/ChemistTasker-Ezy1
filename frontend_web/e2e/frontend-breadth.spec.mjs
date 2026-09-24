import { test, expect } from '@playwright/test';

const baseCapabilities = ['MANAGE_STAFF', 'MANAGE_ROSTER', 'MANAGE_ADMINS', 'MANAGE_COMMUNICATIONS'];

const roleUsers = {
  owner: {
    id: 1,
    username: 'owner-breadth',
    email: 'owner-breadth@example.test',
    role: 'OWNER',
    is_mobile_verified: true,
    memberships: [{ id: 1011, pharmacy_id: 101, pharmacy_name: 'Smoke Pharmacy', role: 'OWNER', status: 'ACCEPTED', is_active: true }],
    pharmacies: [{ id: 101, name: 'Smoke Pharmacy' }],
    admin_assignments: [],
  },
  admin: {
    id: 2,
    username: 'admin-breadth',
    email: 'admin-breadth@example.test',
    role: 'PHARMACIST',
    is_mobile_verified: true,
    memberships: [{ id: 1012, pharmacy_id: 101, pharmacy_name: 'Smoke Pharmacy', role: 'PHARMACIST', employment_type: 'FULL_TIME', status: 'ACCEPTED', is_active: true }],
    admin_assignments: [{ id: 201, pharmacy_id: 101, pharmacy_name: 'Smoke Pharmacy', admin_level: 'FULL_ADMIN', capabilities: baseCapabilities }],
  },
  organization: {
    id: 3,
    username: 'org-breadth',
    email: 'org-breadth@example.test',
    role: 'ORG_ADMIN',
    is_mobile_verified: true,
    memberships: [{
      id: 1013,
      organization_id: 301,
      organization_name: 'Smoke Org',
      role: 'ORG_ADMIN',
      capabilities: baseCapabilities,
      pharmacies: [{ id: 101, name: 'Smoke Pharmacy' }],
      status: 'ACCEPTED',
      is_active: true,
    }],
    admin_assignments: [],
  },
  pharmacist: {
    id: 4,
    username: 'pharmacist-breadth',
    email: 'pharmacist-breadth@example.test',
    role: 'PHARMACIST',
    is_mobile_verified: true,
    memberships: [{ id: 702, pharmacy_id: 101, pharmacy_name: 'Smoke Pharmacy', role: 'PHARMACIST', employment_type: 'FULL_TIME', status: 'ACCEPTED', is_active: true }],
    admin_assignments: [],
  },
  otherstaff: {
    id: 5,
    username: 'staff-breadth',
    email: 'staff-breadth@example.test',
    role: 'OTHER_STAFF',
    is_mobile_verified: true,
    memberships: [{ id: 703, pharmacy_id: 101, pharmacy_name: 'Smoke Pharmacy', role: 'OTHER_STAFF', employment_type: 'PART_TIME', status: 'ACCEPTED', is_active: true }],
    admin_assignments: [],
  },
  explorer: {
    id: 6,
    username: 'explorer-breadth',
    email: 'explorer-breadth@example.test',
    role: 'EXPLORER',
    is_mobile_verified: true,
    memberships: [],
    admin_assignments: [],
  },
};

function json(route, value, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(value),
  });
}

function isRefreshPath(path) {
  return path === '/api/users/token/refresh/' || path.endsWith('/users/token/refresh/');
}

async function installApiFixture(page, user) {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (path.endsWith('/users/me/')) return json(route, user);
    if (path.endsWith('/users/csrf/')) return json(route, { csrfToken: 'breadth-csrf' });
    if (isRefreshPath(path)) return json(route, { access: 'breadth-access', refresh: '' });

    if (path.includes('/chat/rooms')) return json(route, { results: [], count: 0, next: null, previous: null });
    if (path.includes('/notifications')) return json(route, { results: [], unread_count: 0, count: 0 });
    if (path.endsWith('/client-profile/pharmacies/')) return json(route, []);
    if (path.endsWith('/client-profile/my-memberships/')) return json(route, []);
    if (path.endsWith('/client-profile/attendance/worker/status/')) {
      return json(route, { has_active_session: false, session_id: null, pharmacy_id: null, pharmacy_name: null });
    }
    if (path.endsWith('/client-profile/attendance/roster/worker/')) return json(route, { shifts: [] });
    if (path.endsWith('/client-profile/attendance/manager/pending/')) return json(route, []);
    if (path.endsWith('/client-profile/workforce/leave/')) return json(route, []);
    if (path.endsWith('/client-profile/workforce/timesheet-periods/')) return json(route, []);
    if (path.endsWith('/client-profile/workforce/timesheets/')) return json(route, []);
    if (path.includes('/onboarding/')) {
      return json(route, {
        progress_percent: 100,
        verified: true,
        submitted_for_verification: true,
        first_name: 'Smoke',
        last_name: 'User',
        username: user.username,
        phone_number: '0400000000',
        role: user.role,
        number_of_pharmacies: 1,
      });
    }

    if (method === 'GET') return json(route, { results: [], count: 0, next: null, previous: null });
    return json(route, { ok: true, id: 999 });
  });
}

async function openAuthenticatedRoute(page, user, path) {
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await installApiFixture(page, user);
  await page.goto(path);
  await page.waitForLoadState('networkidle');

  expect(new URL(page.url()).pathname).toBe(path.split('?')[0]);
  await expect(page.locator('body')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Page not found');
  await expect(page.locator('body')).not.toContainText('Not Found');
  await expect(page.locator('body')).not.toContainText('Application error');
  expect(pageErrors, `page errors while opening ${path}`).toEqual([]);

  const actionableConsoleErrors = consoleErrors.filter(
    (message) =>
      !message.includes('Failed to load resource') &&
      !message.includes('net::ERR') &&
      !message.includes('Warning:'),
  );
  expect(actionableConsoleErrors, `console errors while opening ${path}`).toEqual([]);
}

test.describe('authenticated route breadth', () => {
  const cases = [
    ['Owner roster', roleUsers.owner, '/dashboard/owner/manage-pharmacies/roster'],
    ['Owner attendance', roleUsers.owner, '/dashboard/owner/attendance'],
    ['Owner post shift', roleUsers.owner, '/dashboard/owner/post-shift'],
    ['Owner active shift centre', roleUsers.owner, '/dashboard/owner/shift-center/active'],
    ['Owner learning', roleUsers.owner, '/dashboard/owner/learning'],
    ['Owner calendar', roleUsers.owner, '/dashboard/owner/calendar'],

    ['Admin manage pharmacies', roleUsers.admin, '/dashboard/admin/101/manage-pharmacies'],
    ['Admin roster', roleUsers.admin, '/dashboard/admin/101/manage-pharmacies/roster'],
    ['Admin post shift', roleUsers.admin, '/dashboard/admin/101/post-shift'],
    ['Admin active shift centre', roleUsers.admin, '/dashboard/admin/101/shift-center/active'],
    ['Admin calendar', roleUsers.admin, '/dashboard/admin/101/calendar'],

    ['Organisation invite staff', roleUsers.organization, '/dashboard/organization/invite'],
    ['Organisation roster', roleUsers.organization, '/dashboard/organization/manage-pharmacies/roster'],
    ['Organisation post shift', roleUsers.organization, '/dashboard/organization/post-shift'],
    ['Organisation active shift centre', roleUsers.organization, '/dashboard/organization/shift-center/active'],
    ['Organisation learning', roleUsers.organization, '/dashboard/organization/learning'],

    ['Pharmacist onboarding', roleUsers.pharmacist, '/dashboard/pharmacist/onboarding'],
    ['Pharmacist roster', roleUsers.pharmacist, '/dashboard/pharmacist/shifts/roster'],
    ['Pharmacist attendance', roleUsers.pharmacist, '/dashboard/pharmacist/attendance'],
    ['Pharmacist availability', roleUsers.pharmacist, '/dashboard/pharmacist/availability'],
    ['Pharmacist learning', roleUsers.pharmacist, '/dashboard/pharmacist/learning'],
    ['Pharmacist calendar', roleUsers.pharmacist, '/dashboard/pharmacist/calendar'],
    ['Pharmacist talent', roleUsers.pharmacist, '/dashboard/pharmacist/interests'],

    ['Other Staff roster', roleUsers.otherstaff, '/dashboard/otherstaff/shifts/roster'],
    ['Other Staff attendance', roleUsers.otherstaff, '/dashboard/otherstaff/attendance'],
    ['Other Staff availability', roleUsers.otherstaff, '/dashboard/otherstaff/availability'],
    ['Other Staff learning', roleUsers.otherstaff, '/dashboard/otherstaff/learning'],
    ['Other Staff talent', roleUsers.otherstaff, '/dashboard/otherstaff/interests'],

    ['Explorer onboarding', roleUsers.explorer, '/dashboard/explorer/onboarding'],
    ['Explorer talent', roleUsers.explorer, '/dashboard/explorer/interests'],
    ['Explorer learning', roleUsers.explorer, '/dashboard/explorer/learning'],
    ['Explorer calendar', roleUsers.explorer, '/dashboard/explorer/calendar'],

    ['Manager leave review', roleUsers.admin, '/dashboard/workforce/leave'],
  ];

  for (const [name, user, path] of cases) {
    test(name, async ({ page }) => {
      await openAuthenticatedRoute(page, user, path);
    });
  }
});

test('manager leave approval uses the existing pharmacy-scoped decision contract exactly once', async ({ page }) => {
  await installApiFixture(page, roleUsers.admin);

  let decided = false;
  let decisionPosts = 0;
  let observedDecision = null;

  await page.route('**/api/client-profile/pharmacies/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'GET' && path.endsWith('/client-profile/pharmacies/')) {
      return json(route, [{ id: 101, name: 'Smoke Pharmacy' }]);
    }
    return route.fallback();
  });

  await page.route('**/api/client-profile/workforce/leave/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === 'GET' && url.pathname.endsWith('/client-profile/workforce/leave/')) {
      expect(url.searchParams.get('pharmacy_id')).toBe('101');
      expect(url.searchParams.get('status')).toBe('PENDING');
      return json(route, decided ? [] : [{
        id: 801,
        worker_name: 'Smoke Worker',
        pharmacy_name: 'Smoke Pharmacy',
        leave_type: 'ANNUAL',
        start_at: '2026-09-28T09:00:00+10:00',
        end_at: '2026-09-28T17:00:00+10:00',
        note: 'Smoke leave',
        status: 'PENDING',
      }]);
    }

    if (request.method() === 'POST' && url.pathname.endsWith('/client-profile/workforce/leave/801/decision/')) {
      decisionPosts += 1;
      observedDecision = {
        method: request.method(),
        path: url.pathname,
        body: request.postDataJSON(),
      };
      decided = true;
      return json(route, { id: 801, status: 'APPROVED' });
    }

    return route.fallback();
  });

  await page.goto('/dashboard/workforce/leave');
  await expect(page.getByText('Smoke Worker')).toBeVisible();

  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('prompt');
    await dialog.accept('Approved in smoke');
  });
  await page.getByRole('button', { name: 'Approve' }).click();

  await expect(page.getByText('No leave requests match the selected filters.')).toBeVisible();
  expect(decisionPosts).toBe(1);
  expect(observedDecision).toEqual({
    method: 'POST',
    path: '/api/client-profile/workforce/leave/801/decision/',
    body: {
      decision: 'APPROVED',
      manager_note: 'Approved in smoke',
    },
  });
});

test('worker leave form validates required fields and submits the established leave payload once', async ({ page }) => {
  await installApiFixture(page, roleUsers.otherstaff);

  let createPosts = 0;
  let observedCreate = null;

  await page.route('**/api/client-profile/workforce/leave/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === 'GET' && url.pathname.endsWith('/client-profile/workforce/leave/')) {
      return json(route, []);
    }

    if (request.method() === 'POST' && url.pathname.endsWith('/client-profile/workforce/leave/')) {
      createPosts += 1;
      observedCreate = {
        method: request.method(),
        path: url.pathname,
        body: request.postDataJSON(),
      };
      return json(route, { id: 802, status: 'PENDING' });
    }

    return route.fallback();
  });

  await page.goto('/dashboard/my-leave');
  await page.getByRole('button', { name: 'Request leave' }).click();

  const submit = page.getByRole('button', { name: 'Submit' });
  await expect(submit).toBeDisabled();

  await page.getByLabel('Start').fill('2026-09-28T09:00');
  await page.getByLabel('End').fill('2026-09-28T17:00');
  await page.getByLabel('Note').fill('Smoke leave request');
  await expect(submit).toBeEnabled();
  await submit.click();

  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(createPosts).toBe(1);
  expect(observedCreate).not.toBeNull();
  expect(observedCreate.method).toBe('POST');
  expect(observedCreate.path).toBe('/api/client-profile/workforce/leave/');
  expect(observedCreate.body).toMatchObject({
    membership_id: 703,
    leave_type: 'ANNUAL',
    note: 'Smoke leave request',
  });
  expect(Number.isNaN(Date.parse(observedCreate.body.start_at))).toBe(false);
  expect(Number.isNaN(Date.parse(observedCreate.body.end_at))).toBe(false);
  expect(Date.parse(observedCreate.body.end_at) - Date.parse(observedCreate.body.start_at)).toBe(8 * 60 * 60 * 1000);
});

test('worker QR clock-in uses the existing attendance contract once and renders success', async ({ page }) => {
  await installApiFixture(page, roleUsers.pharmacist);

  let clockInPosts = 0;
  let observedClockIn = null;

  await page.route('**/api/client-profile/attendance/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === 'GET' && url.pathname.endsWith('/attendance/worker/status/')) {
      return json(route, { has_active_session: false, session_id: null, pharmacy_id: null, pharmacy_name: null });
    }
    if (request.method() === 'GET' && url.pathname.endsWith('/attendance/roster/worker/')) {
      return json(route, { shifts: [] });
    }
    if (request.method() === 'POST' && url.pathname.endsWith('/attendance/worker/clock-in/')) {
      clockInPosts += 1;
      observedClockIn = {
        method: request.method(),
        path: url.pathname,
        body: request.postDataJSON(),
      };
      return json(route, { is_provisional: false, pharmacy_name: 'Smoke Pharmacy' });
    }

    return route.fallback();
  });

  await page.goto('/dashboard/pharmacist/attendance');
  await page.getByRole('button', { name: 'Scan Pharmacy QR' }).click();
  await page.getByLabel('QR Code Token').fill('smoke-qr-token');
  await page.getByRole('button', { name: 'Confirm Clock In' }).click();

  await expect(page.getByRole('alert')).toContainText('Clocked in successfully at Smoke Pharmacy.');
  expect(clockInPosts).toBe(1);
  expect(observedClockIn).toEqual({
    method: 'POST',
    path: '/api/client-profile/attendance/worker/clock-in/',
    body: { qr_token: 'smoke-qr-token' },
  });
});

test('worker QR clock-in handles server failure without duplicate submission or dead-end', async ({ page }) => {
  await installApiFixture(page, roleUsers.pharmacist);

  let clockInPosts = 0;

  await page.route('**/api/client-profile/attendance/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === 'GET' && url.pathname.endsWith('/attendance/worker/status/')) {
      return json(route, { has_active_session: false, session_id: null, pharmacy_id: null, pharmacy_name: null });
    }
    if (request.method() === 'GET' && url.pathname.endsWith('/attendance/roster/worker/')) {
      return json(route, { shifts: [] });
    }
    if (request.method() === 'POST' && url.pathname.endsWith('/attendance/worker/clock-in/')) {
      clockInPosts += 1;
      return json(route, { detail: 'Smoke server failure' }, 500);
    }

    return route.fallback();
  });

  await page.goto('/dashboard/pharmacist/attendance');
  await page.getByRole('button', { name: 'Scan Pharmacy QR' }).click();
  await page.getByLabel('QR Code Token').fill('smoke-failing-token');
  const confirm = page.getByRole('button', { name: 'Confirm Clock In' });
  await confirm.click();

  await expect(page.getByRole('alert')).toContainText('Request failed with status 500');
  await expect(confirm).toBeEnabled();
  expect(clockInPosts).toBe(1);
});

test('worker roster acknowledgement uses the established acknowledgement endpoint and period ID', async ({ page }) => {
  await installApiFixture(page, roleUsers.pharmacist);

  let acknowledged = false;
  let acknowledgePosts = 0;
  let observedAcknowledge = null;

  await page.route('**/api/client-profile/attendance/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === 'GET' && url.pathname.endsWith('/attendance/worker/status/')) {
      return json(route, { has_active_session: false, session_id: null, pharmacy_id: null, pharmacy_name: null });
    }
    if (request.method() === 'GET' && url.pathname.endsWith('/attendance/roster/worker/')) {
      return json(route, {
        shifts: [{
          assignment_id: 991,
          period_id: 501,
          pharmacy_id: 101,
          pharmacy_name: 'Smoke Pharmacy',
          slot_date: '2026-09-29',
          start_time: '09:00:00',
          end_time: '17:00:00',
          role: 'PHARMACIST',
          is_acknowledged: acknowledged,
        }],
      });
    }
    if (request.method() === 'POST' && url.pathname.endsWith('/attendance/roster/acknowledge/')) {
      acknowledgePosts += 1;
      observedAcknowledge = {
        method: request.method(),
        path: url.pathname,
        body: request.postDataJSON(),
      };
      acknowledged = true;
      return json(route, { ok: true });
    }

    return route.fallback();
  });

  await page.goto('/dashboard/pharmacist/attendance');
  await expect(page.getByText('Smoke Pharmacy')).toBeVisible();
  await page.getByRole('button', { name: 'Acknowledge Shifts' }).click();

  await expect(page.getByText('ACKNOWLEDGED')).toBeVisible();
  expect(acknowledgePosts).toBe(1);
  expect(observedAcknowledge).toEqual({
    method: 'POST',
    path: '/api/client-profile/attendance/roster/acknowledge/',
    body: {
      period_id: 501,
      notes: 'Acknowledged via Worker Attendance Dashboard',
    },
  });
});
