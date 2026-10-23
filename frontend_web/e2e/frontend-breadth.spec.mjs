import { test, expect } from '@playwright/test';
import { baseCapabilities, installApiFixture, json, roleUsers } from './support/apiFixture.mjs';

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

  const expectedPath =
    path.split('?')[0].endsWith('/pharmacy-hub')
      ? '/dashboard/pharmacy-hub'
      : path.split('?')[0];
  await expect.poll(() => new URL(page.url()).pathname, { message: `canonical route while opening ${path}` }).toBe(expectedPath);
  await expect(page.locator('body')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Page not found');
  await expect(page.locator('body')).not.toContainText('Not Found');
  await expect(page.locator('body')).not.toContainText('Application error');
  expect(pageErrors, `page errors while opening ${path}`).toEqual([]);

  const actionableConsoleErrors = consoleErrors.filter(
    (message) =>
      !message.includes('Failed to load resource') &&
      !message.includes('net::ERR') &&
      !message.includes('Warning:') &&
      !message.includes('Google Maps JavaScript API error: ApiProjectMapError') &&
      !message.startsWith('Failed to load Google Maps script, retrying in '),
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
    ['Owner manage pharmacies', roleUsers.owner, '/dashboard/owner/manage-pharmacies'],
    ['Owner invoices', roleUsers.owner, '/dashboard/owner/invoice'],
    ['Owner chat', roleUsers.owner, '/dashboard/owner/chat'],
    ['Owner pharmacy hub', roleUsers.owner, '/dashboard/owner/pharmacy-hub'],

    ['Admin manage pharmacies', roleUsers.admin, '/dashboard/admin/101/manage-pharmacies'],
    ['Admin roster', roleUsers.admin, '/dashboard/admin/101/manage-pharmacies/roster'],
    ['Admin post shift', roleUsers.admin, '/dashboard/admin/101/post-shift'],
    ['Admin active shift centre', roleUsers.admin, '/dashboard/admin/101/shift-center/active'],
    ['Admin calendar', roleUsers.admin, '/dashboard/admin/101/calendar'],
    ['Admin invoices', roleUsers.admin, '/dashboard/admin/101/invoice'],
    ['Admin chat', roleUsers.admin, '/dashboard/admin/101/chat'],

    ['Organisation invite staff', roleUsers.organization, '/dashboard/organization/invite'],
    ['Organisation roster', roleUsers.organization, '/dashboard/organization/manage-pharmacies/roster'],
    ['Organisation post shift', roleUsers.organization, '/dashboard/organization/post-shift'],
    ['Organisation active shift centre', roleUsers.organization, '/dashboard/organization/shift-center/active'],
    ['Organisation learning', roleUsers.organization, '/dashboard/organization/learning'],
    ['Organisation invoices', roleUsers.organization, '/dashboard/organization/invoice'],
    ['Organisation chat', roleUsers.organization, '/dashboard/organization/chat'],
    ['Organisation pharmacy hub', roleUsers.organization, '/dashboard/organization/pharmacy-hub'],

    ['Pharmacist onboarding', roleUsers.pharmacist, '/dashboard/pharmacist/onboarding'],
    ['Pharmacist roster', roleUsers.pharmacist, '/dashboard/pharmacist/shifts/roster'],
    ['Pharmacist attendance', roleUsers.pharmacist, '/dashboard/pharmacist/attendance'],
    ['Pharmacist availability', roleUsers.pharmacist, '/dashboard/pharmacist/availability'],
    ['Pharmacist learning', roleUsers.pharmacist, '/dashboard/pharmacist/learning'],
    ['Pharmacist calendar', roleUsers.pharmacist, '/dashboard/pharmacist/calendar'],
    ['Pharmacist talent', roleUsers.pharmacist, '/dashboard/pharmacist/interests'],
    ['Pharmacist invoices', roleUsers.pharmacist, '/dashboard/pharmacist/invoice'],
    ['Pharmacist chat', roleUsers.pharmacist, '/dashboard/pharmacist/chat'],
    ['Pharmacist pharmacy hub', roleUsers.pharmacist, '/dashboard/pharmacist/pharmacy-hub'],

    ['Other Staff roster', roleUsers.otherstaff, '/dashboard/otherstaff/shifts/roster'],
    ['Other Staff attendance', roleUsers.otherstaff, '/dashboard/otherstaff/attendance'],
    ['Other Staff availability', roleUsers.otherstaff, '/dashboard/otherstaff/availability'],
    ['Other Staff learning', roleUsers.otherstaff, '/dashboard/otherstaff/learning'],
    ['Other Staff talent', roleUsers.otherstaff, '/dashboard/otherstaff/interests'],
    ['Other Staff invoices', roleUsers.otherstaff, '/dashboard/otherstaff/invoice'],
    ['Other Staff chat', roleUsers.otherstaff, '/dashboard/otherstaff/chat'],
    ['Other Staff pharmacy hub', roleUsers.otherstaff, '/dashboard/otherstaff/pharmacy-hub'],

    ['Explorer onboarding', roleUsers.explorer, '/dashboard/explorer/onboarding'],
    ['Explorer public shifts', roleUsers.explorer, '/dashboard/explorer/shifts/public'],
    ['Explorer community shifts', roleUsers.explorer, '/dashboard/explorer/shifts/community'],
    ['Explorer confirmed shifts', roleUsers.explorer, '/dashboard/explorer/shifts/confirmed'],
    ['Explorer history', roleUsers.explorer, '/dashboard/explorer/shifts/history'],
    ['Explorer availability', roleUsers.explorer, '/dashboard/explorer/availability'],
    ['Explorer talent', roleUsers.explorer, '/dashboard/explorer/interests'],
    ['Explorer learning', roleUsers.explorer, '/dashboard/explorer/learning'],
    ['Explorer calendar', roleUsers.explorer, '/dashboard/explorer/calendar'],
    ['Explorer chat', roleUsers.explorer, '/dashboard/explorer/chat'],

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

  await page.route('**/api/v1/pharmacies/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'GET' && path.endsWith('/pharmacies/')) {
      return json(route, [{ id: 101, name: 'Smoke Pharmacy' }]);
    }
    return route.fallback();
  });

  await page.route('**/api/v1/workforce/leave/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === 'GET' && url.pathname.endsWith('/workforce/leave/')) {
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

    if (request.method() === 'POST' && url.pathname.endsWith('/workforce/leave/801/decision/')) {
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
    path: '/api/v1/workforce/leave/801/decision/',
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

  await page.route('**/api/v1/workforce/leave/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === 'GET' && url.pathname.endsWith('/workforce/leave/')) {
      return json(route, []);
    }

    if (request.method() === 'POST' && url.pathname.endsWith('/workforce/leave/')) {
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
  expect(observedCreate.path).toBe('/api/v1/workforce/leave/');
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

  await page.route('**/api/v1/attendance/**', async (route) => {
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
  await page.getByRole('button', { name: 'Scan pharmacy QR' }).click();
  await page.getByLabel('QR code').fill('smoke-qr-token');
  await page.getByRole('button', { name: 'Clock in', exact: true }).click();

  await expect(page.getByRole('alert')).toContainText('Clocked in successfully at Smoke Pharmacy.');
  expect(clockInPosts).toBe(1);
  expect(observedClockIn).toEqual({
    method: 'POST',
    path: '/api/v1/attendance/worker/clock-in/',
    body: { qr_token: 'smoke-qr-token' },
  });
});

test('worker QR clock-in handles server failure without duplicate submission or dead-end', async ({ page }) => {
  await installApiFixture(page, roleUsers.pharmacist);

  let clockInPosts = 0;

  await page.route('**/api/v1/attendance/**', async (route) => {
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
  await page.getByRole('button', { name: 'Scan pharmacy QR' }).click();
  await page.getByLabel('QR code').fill('smoke-failing-token');
  const confirm = page.getByRole('button', { name: 'Clock in', exact: true });
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

  await page.route('**/api/v1/attendance/**', async (route) => {
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
  await expect(page.getByRole('heading', { name: 'Smoke Pharmacy' })).toBeVisible();
  await page.getByRole('button', { name: 'Acknowledge week' }).click();

  await expect(page.getByText('Acknowledged', { exact: true })).toBeVisible();
  expect(acknowledgePosts).toBe(1);
  expect(observedAcknowledge).toEqual({
    method: 'POST',
    path: '/api/v1/attendance/roster/acknowledge/',
    body: {
      period_id: 501,
      notes: 'Acknowledged via Worker Attendance Dashboard',
    },
  });
});


test('owner pharmacy selector lists all authorised locations and delegates Admin-only pharmacies', async ({ page }) => {
  const owner = {
    ...roleUsers.owner,
    id: 610,
    memberships: [
      { pharmacy_id: 101, pharmacy_name: 'Alpha Owner Pharmacy', role: 'OWNER', status: 'ACCEPTED', is_active: true },
      { pharmacy_id: 102, pharmacy_name: 'Beta Owner Pharmacy', role: 'OWNER', status: 'ACCEPTED', is_active: true },
    ],
    admin_assignments: [
      { id: 701, pharmacy_id: 101, pharmacy_name: 'Alpha Owner Pharmacy', admin_level: 'OWNER', capabilities: baseCapabilities, is_active: true },
      { id: 702, pharmacy_id: 102, pharmacy_name: 'Beta Owner Pharmacy', admin_level: 'OWNER', capabilities: baseCapabilities, is_active: true },
      { id: 703, pharmacy_id: 103, pharmacy_name: 'Gamma Managed Pharmacy', admin_level: 'FULL_ADMIN', capabilities: baseCapabilities, is_active: true },
      { id: 704, pharmacy_id: 104, pharmacy_name: 'Delta Managed Pharmacy', admin_level: 'FULL_ADMIN', capabilities: baseCapabilities, is_active: true },
    ],
  };
  await installApiFixture(page, owner);
  await page.route('**/api/v1/pharmacies/**', (route) => json(route, [
    { id: 101, name: 'Alpha Owner Pharmacy' },
    { id: 102, name: 'Beta Owner Pharmacy' },
    { id: 103, name: 'Gamma Managed Pharmacy' },
    { id: 104, name: 'Delta Managed Pharmacy' },
  ]));
  await page.goto('/dashboard/owner/manage-pharmacies?workspace=internal&pharmacy_id=101');
  const selector = page.getByRole('button', { name: /Select pharmacy workspace/ });
  await expect(selector).toBeVisible();
  await selector.click();
  const menu = page.getByRole('menu', { name: 'Available pharmacy workspaces' });
  await expect(menu).toContainText('4 pharmacies available');
  for (const name of ['Alpha Owner Pharmacy', 'Beta Owner Pharmacy', 'Gamma Managed Pharmacy', 'Delta Managed Pharmacy']) {
    await expect(menu).toContainText(name);
  }
  await menu.getByRole('menuitem', { name: /Gamma Managed Pharmacy/ }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/dashboard/admin/103/overview');
});


for (const action of ['edit', 'delete']) {
  test(`pharmacy action=${action} link opens only when the API allows editing`, async ({ context }) => {
    const writes = [];
    // Cold load of the shared link in a fresh tab (own sessionStorage), no in-app click-through.
    const openInFreshTab = async (canEdit) => {
      const page = await context.newPage();
      await installApiFixture(page, roleUsers.owner);
      await page.route('**/api/v1/pharmacies/**', (route) => {
        const request = route.request();
        if (request.method() !== 'GET') {
          writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
          return json(route, {});
        }
        return json(route, [{ id: 101, name: 'Linked Pharmacy', can_edit: canEdit }]);
      });
      await page.goto(`/dashboard/owner/manage-pharmacies?workspace=internal&pharmacy_id=101&view=detail&pharmacyId=101&action=${action}`);
      return { page, dialog: page.getByRole('dialog', { name: action === 'edit' ? 'Edit Pharmacy' : 'Delete Pharmacy' }) };
    };

    const allowed = await openInFreshTab(true);
    await expect(allowed.dialog).toBeVisible();
    expect(new URL(allowed.page.url()).searchParams.get('pharmacyId')).toBe('101');

    const denied = await openInFreshTab(false);
    await expect(denied.page.getByText('Linked Pharmacy').first()).toBeVisible();
    await expect.poll(() => new URL(denied.page.url()).searchParams.get('action')).toBeNull();
    expect(new URL(denied.page.url()).searchParams.get('pharmacyId')).toBe('101');
    await expect(denied.dialog).toHaveCount(0);
    expect(writes).toEqual([]);
  });

  test(`pharmacy action=${action} link ignores a stale cached can_edit on same-tab reload`, async ({ page }) => {
    await installApiFixture(page, roleUsers.owner);
    let canEdit = true;
    let releaseFresh;
    const freshHeld = new Promise((resolve) => { releaseFresh = resolve; });
    const writes = [];
    await page.route('**/api/v1/pharmacies/**', async (route) => {
      const request = route.request();
      if (request.method() !== 'GET') {
        writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
        return json(route, {});
      }
      // Hold the fresh answer until the test has seen the sessionStorage cache render.
      if (!canEdit) await freshHeld;
      return json(route, [{ id: 101, name: 'Linked Pharmacy', can_edit: canEdit }]);
    });
    await page.goto('/dashboard/owner/manage-pharmacies?workspace=internal&pharmacy_id=101');
    await expect(page.getByText('Linked Pharmacy').first()).toBeVisible();
    await expect.poll(() => page.evaluate(() => Object.values(sessionStorage).some((value) => value.includes('"can_edit":true')))).toBe(true);

    canEdit = false;
    const dialog = page.getByRole('dialog', { name: action === 'edit' ? 'Edit Pharmacy' : 'Delete Pharmacy' });
    const freshRequest = page.waitForRequest((request) => request.method() === 'GET' && request.url().includes('/api/v1/pharmacies/'));
    await page.goto(`/dashboard/owner/manage-pharmacies?workspace=internal&pharmacy_id=101&view=detail&pharmacyId=101&action=${action}`);
    await freshRequest;
    await expect(page.getByText('Linked Pharmacy').first()).toBeVisible();
    await expect(dialog).toHaveCount(0);
    releaseFresh();
    await expect.poll(() => new URL(page.url()).searchParams.get('action')).toBeNull();
    await expect(dialog).toHaveCount(0);
    expect(writes).toEqual([]);
  });

  test(`pharmacy action=${action} in-app link waits for a focus refetch that revokes can_edit`, async ({ page }) => {
    const user = { ...roleUsers.owner };
    await installApiFixture(page, user);
    let canEdit = true;
    let releaseRefetch;
    const refetchHeld = new Promise((resolve) => { releaseRefetch = resolve; });
    const writes = [];
    await page.route('**/api/v1/pharmacies/**', async (route) => {
      const request = route.request();
      if (request.method() !== 'GET') {
        writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
        return json(route, {});
      }
      // Keep the replacement request in flight until the link has been followed.
      if (!canEdit) await refetchHeld;
      return json(route, [{ id: 101, name: 'Linked Pharmacy', can_edit: canEdit }]);
    });
    const dialog = page.getByRole('dialog', { name: action === 'edit' ? 'Edit Pharmacy' : 'Delete Pharmacy' });
    await page.goto('/dashboard/owner/manage-pharmacies?workspace=internal&pharmacy_id=101');
    await expect(page.getByText('Linked Pharmacy').first()).toBeVisible();
    await page.waitForLoadState('networkidle');

    // A focus re-check returns a changed user, so the page refetches pharmacies; the answer now revokes editing.
    canEdit = false;
    user.first_name = 'Refreshed';
    const refetch = page.waitForRequest((request) => request.method() === 'GET' && request.url().includes('/api/v1/pharmacies/'));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await refetch;
    await page.evaluate((url) => {
      window.history.pushState({}, '', url);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, `/dashboard/owner/manage-pharmacies?workspace=internal&pharmacy_id=101&view=detail&pharmacyId=101&action=${action}`);

    await expect(dialog).toHaveCount(0);
    releaseRefetch();
    await expect.poll(() => new URL(page.url()).searchParams.get('action')).toBeNull();
    await expect(dialog).toHaveCount(0);
    expect(writes).toEqual([]);
  });
}

for (const outcome of ['failure', 'success']) {
  test(`pharmacy cache isolates same-tab logout and login while the next user's request is delayed (${outcome})`, async ({ page }) => {
    const ownerA = { ...roleUsers.owner, first_name: 'Account A' };
    const ownerB = {
      ...roleUsers.owner, id: 12, username: 'owner-b', email: 'owner-b@example.test',
      memberships: [{ pharmacy_id: 102, pharmacy_name: 'Account B Pharmacy', role: 'OWNER' }],
      pharmacies: [{ id: 102, name: 'Account B Pharmacy' }],
    };
    let currentUser = ownerA;
    let releaseB;
    const heldB = new Promise((resolve) => { releaseB = resolve; });
    await installApiFixture(page, ownerA, async (route, { path }) => {
      if (path.endsWith('/users/me/')) return json(route, currentUser ?? {}, currentUser ? 200 : 401);
      if (path.endsWith('/users/logout/')) {
        currentUser = null;
        return json(route, {});
      }
      if (path.endsWith('/users/login/')) {
        currentUser = ownerB;
        return json(route, { access: 'owner-b-access', user: ownerB });
      }
      if (path.endsWith('/pharmacies/')) {
        if (currentUser?.id === ownerB.id) {
          await heldB;
          return outcome === 'failure'
            ? json(route, { detail: 'Unavailable' }, 503)
            : json(route, [{ id: 102, name: 'Account B Pharmacy', can_edit: true }]);
        }
        return json(route, [{ id: 101, name: 'Private A Pharmacy', can_edit: true }]);
      }
      if (path.endsWith('/memberships/')) return json(route, currentUser?.id === ownerA.id ? [{
        id: 901, role: 'PHARMACIST', employment_type: 'FULL_TIME', status: 'ACCEPTED', is_active: true,
        user_details: { first_name: 'Private A Staff', email: 'staff-a@example.test' },
      }] : []);
      if (path.endsWith('/pharmacy-admins/')) return json(route, currentUser?.id === ownerA.id ? [{
        id: 902, pharmacy: 101, admin_level: 'FULL_ADMIN', is_active: true,
        user_details: { first_name: 'Private A Admin', email: 'admin-a@example.test' },
      }] : []);
    });
    await page.goto('/dashboard/owner/manage-pharmacies?view=detail&pharmacyId=101&pharmacy_id=101');
    await expect(page.getByText('Private A Pharmacy').first()).toBeVisible();
    await page.getByRole('tab', { name: /^Staff/ }).click();
    await expect(page.getByText('Private A Staff', { exact: true })).toBeVisible();
    await page.getByRole('tab', { name: /^Admins/ }).click();
    await expect(page.getByText('Private A Admin', { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => Object.values(sessionStorage).some(
      (value) => value.includes('Private A Staff') && value.includes('Private A Admin'),
    ))).toBe(true);

    // Use the real logout flow and login form in this tab; sessionStorage survives navigation.
    await page.evaluate(() => {
      window.history.pushState({}, '', '/dashboard/owner/logout');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => Object.keys(sessionStorage).filter((key) => key.startsWith('pharmacyPage.cache.')))).toEqual([]);
    const trackLeaks = () => {
      window.pharmacyLeaks = [];
      new MutationObserver((records) => {
        for (const record of records) {
          for (const node of [record.target, ...record.addedNodes]) {
            if (/Private A (Pharmacy|Staff|Admin)|staff-a@example.test|admin-a@example.test/.test(node.textContent || '')) {
              window.pharmacyLeaks.push(node.textContent);
            }
          }
        }
      }).observe(document, { subtree: true, childList: true, characterData: true });
    };
    await page.addInitScript(trackLeaks);
    await page.evaluate(trackLeaks);
    await page.getByLabel('Email', { exact: true }).fill(ownerB.email);
    await page.getByLabel('Password', { exact: true }).fill('test-password');
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/dashboard/owner/overview');
    const requestB = page.waitForRequest((request) => new URL(request.url()).pathname.endsWith('/pharmacies/'));
    await page.goto('/dashboard/owner/manage-pharmacies');
    await requestB;
    await expect(page.getByRole('main')).not.toContainText('Account B Pharmacy');
    await expect(page.locator('body')).not.toContainText(/Private A (Pharmacy|Staff|Admin)/);
    expect(await page.evaluate(() => window.pharmacyLeaks)).toEqual([]);
    const responseB = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith('/pharmacies/'));
    releaseB();
    await responseB;
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).not.toContainText(/Private A (Pharmacy|Staff|Admin)/);
    expect(await page.evaluate(() => window.pharmacyLeaks)).toEqual([]);
    if (outcome === 'success') await expect(page.getByRole('main').getByText('Account B Pharmacy', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => Object.entries(sessionStorage).filter(([key]) => key.startsWith('pharmacyPage.cache.')).some(
      ([, value]) => /Private A (Pharmacy|Staff|Admin)/.test(value),
    ))).toBe(false);
  });
}

test('pharmacy detail shell selection keeps both scope params on the selected pharmacy without a loop', async ({ page }) => {
  await installApiFixture(page, {
    ...roleUsers.owner,
    memberships: [101, 102].map((pharmacy_id) => ({ pharmacy_id, role: 'OWNER' })),
  });
  await page.route('**/api/v1/pharmacies/**', (route) => json(route, [
    { id: 101, name: 'First Pharmacy', can_edit: true },
    { id: 102, name: 'Second Pharmacy', can_edit: true },
  ]));
  await page.goto('/dashboard/owner/manage-pharmacies?view=detail&pharmacyId=101&pharmacy_id=101');
  await expect(page.getByRole('heading', { name: 'First Pharmacy', exact: true })).toBeVisible();
  await page.waitForLoadState('networkidle');
  const navigations = [];
  page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) navigations.push(frame.url()); });
  await page.getByRole('button', { name: /Select pharmacy workspace/ }).click();
  await page.getByRole('menu', { name: 'Available pharmacy workspaces' }).getByRole('menuitem', { name: /Second Pharmacy/ }).click();
  await expect(page.getByRole('heading', { name: 'Second Pharmacy', exact: true })).toBeVisible();
  await page.waitForLoadState('networkidle');
  const params = new URL(page.url()).searchParams;
  expect(params.get('pharmacyId')).toBe('102');
  expect(params.get('pharmacy_id')).toBe('102');
  expect(params.get('view')).toBe('detail');
  expect(navigations.length).toBeGreaterThan(0);
  expect(navigations.length).toBeLessThanOrEqual(3);
  expect(navigations.every((url) => new URL(url).searchParams.get('pharmacyId') === '102')).toBe(true);
});

test('pharmacy view=detail link survives a cold load', async ({ page }) => {
  await installApiFixture(page, roleUsers.owner);
  await page.route('**/api/v1/pharmacies/**', (route) => json(route, [{ id: 101, name: 'Linked Pharmacy', can_edit: true }]));
  await page.goto('/dashboard/owner/manage-pharmacies?workspace=internal&pharmacy_id=101&view=detail&pharmacyId=101');
  await expect(page.getByText('Linked Pharmacy').first()).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get('pharmacyId')).toBe('101');
  expect(new URL(page.url()).searchParams.get('view')).toBe('detail');
});

test('pharmacy create asks for a retry after a lost response and shows one already-saved notice on 409', async ({ page }) => {
  await installApiFixture(page, roleUsers.owner);
  const createKeys = [];
  await page.route('**/api/v1/pharmacies/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && path.endsWith('/pharmacies/')) {
      createKeys.push(request.headers()['idempotency-key']);
      // First submit: the response never arrives. Second: the key was already used with other details.
      if (createKeys.length === 1) return route.abort('failed');
      return json(route, { detail: 'Idempotency-Key was already used with different details.', pharmacy_id: 101 }, 409);
    }
    if (path.endsWith('/pharmacies/101/')) return json(route, { id: 101, name: 'Saved Pharmacy', can_edit: true });
    return json(route, [{ id: 101, name: 'Saved Pharmacy', can_edit: true }]);
  });
  await page.goto('/dashboard/owner/manage-pharmacies?workspace=internal&pharmacy_id=101');
  await page.getByRole('button', { name: 'Add Pharmacy' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Pharmacy Name').fill('New Pharmacy');
  await dialog.getByRole('button', { name: 'Next' }).click();
  await dialog.getByLabel('ABN').first().fill('51824753556');
  for (let tab = 1; tab < 5; tab += 1) await dialog.getByRole('button', { name: 'Next' }).click();
  for (const label of ['Weekday Rate', 'Saturday Rate', 'Sunday Rate', 'Public Holiday Rate']) {
    await dialog.getByLabel(label).fill('50');
  }
  await dialog.getByRole('button', { name: 'Next' }).click();
  const create = dialog.getByRole('button', { name: 'Create Pharmacy' });

  await create.click();
  await expect(page.getByText("We couldn't confirm the pharmacy was saved. Press Save again — it won't create a duplicate.")).toBeVisible();
  await expect(page.getByText('An unexpected error occurred.')).toHaveCount(0);

  await create.click();
  const alreadySaved = page.getByText('This pharmacy was already saved earlier with different details.', { exact: false });
  await expect(alreadySaved).toBeVisible();
  await expect(alreadySaved).toHaveCount(1);
  expect(createKeys).toHaveLength(2);
  expect(createKeys[1]).toBe(createKeys[0]);
});

test('pharmacy create keeps its key when the 409 recovery read fails', async ({ page }) => {
  await installApiFixture(page, roleUsers.owner);
  const createKeys = [];
  await page.route('**/api/v1/pharmacies/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && path.endsWith('/pharmacies/')) {
      createKeys.push(request.headers()['idempotency-key']);
      return json(route, { detail: 'Idempotency-Key was already used with different details.', pharmacy_id: 202 }, 409);
    }
    if (path.endsWith('/pharmacies/202/')) return route.abort('failed');
    if (path.endsWith('/pharmacies/101/')) return json(route, { id: 101, name: 'Saved Pharmacy', can_edit: true });
    return json(route, [{ id: 101, name: 'Saved Pharmacy', can_edit: true }]);
  });
  await page.goto('/dashboard/owner/manage-pharmacies?workspace=internal&pharmacy_id=101');
  await page.getByRole('button', { name: 'Add Pharmacy' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Pharmacy Name').fill('New Pharmacy');
  await dialog.getByRole('button', { name: 'Next' }).click();
  await dialog.getByLabel('ABN').first().fill('51824753556');
  for (let tab = 1; tab < 5; tab += 1) await dialog.getByRole('button', { name: 'Next' }).click();
  for (const label of ['Weekday Rate', 'Saturday Rate', 'Sunday Rate', 'Public Holiday Rate']) {
    await dialog.getByLabel(label).fill('50');
  }
  await dialog.getByRole('button', { name: 'Next' }).click();
  const create = dialog.getByRole('button', { name: 'Create Pharmacy' });
  const notOpened = page.getByText('The saved pharmacy could not be opened.', { exact: false });

  await create.click();
  await expect(notOpened).toBeVisible();
  await create.click();
  await expect.poll(() => createKeys.length).toBe(2);
  await expect(notOpened).toBeVisible();
  expect(createKeys[1]).toBe(createKeys[0]);
});

// Calendar, post-shift and roster links carry their own `pharmacy` param (dashboardRouteScope, roster emails).
for (const [name, path] of [
  ['roster email', '/dashboard/owner/manage-pharmacies/roster?pharmacy=102'],
  ['roster', '/dashboard/owner/manage-pharmacies/roster?workspace=internal&pharmacy_id=102&pharmacy=102'],
  ['calendar', '/dashboard/owner/calendar?workspace=internal&pharmacy_id=102&pharmacy=102'],
  ['post-shift', '/dashboard/owner/post-shift?workspace=internal&pharmacy_id=102&pharmacy=102'],
]) {
  test(`${name} pharmacy link survives a cold load in a fresh tab`, async ({ context }) => {
    const page = await context.newPage();
    await installApiFixture(page, roleUsers.owner);
    const rosterQueries = [];
    await page.route('**/api/v1/pharmacies/**', (route) => json(route, [
      { id: 101, name: 'Smoke Pharmacy', can_edit: true },
      { id: 102, name: 'Linked Pharmacy', can_edit: true },
    ]));
    page.on('request', (request) => {
      if (request.url().includes('/roster-owner/')) rosterQueries.push(new URL(request.url()).searchParams.toString());
    });
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    expect(new URL(page.url()).searchParams.get('pharmacy')).toBe('102');
    // The calendar page re-syncs pharmacy_id from its own memberships list, which the fixture keeps at 101.
    if (name !== 'calendar') expect(new URL(page.url()).searchParams.get('pharmacy_id')).toBe('102');
    if (name.startsWith('roster')) {
      // The roster reads `pharmacy` once on mount, so the normalised URL must still pick 102 on reload.
      rosterQueries.length = 0;
      await page.reload();
      await expect.poll(() => rosterQueries.some((query) => /(^|&)pharmacy(_id)?=102(&|$)/.test(query))).toBe(true);
      expect(rosterQueries.some((query) => /(^|&)pharmacy(_id)?=101(&|$)/.test(query))).toBe(false);
    }
  });
}

test('owner sidebar collapses without losing access to navigation or widening the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 820 });
  await installApiFixture(page, roleUsers.owner);
  await page.goto('/dashboard/owner/overview');
  const sidebar = page.locator('aside[aria-label="Dashboard navigation"]');
  await expect(sidebar).toBeVisible();
  await sidebar.getByRole('button', { name: 'Collapse sidebar' }).click();
  await expect(sidebar.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
  await expect(sidebar.getByRole('button', { name: 'Overview' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1281);
  await sidebar.getByRole('button', { name: 'Expand sidebar' }).click();
  await expect(sidebar.getByRole('button', { name: 'Manage Pharmacies', exact: true })).toBeVisible();
});


test('owner navigation presents nested pharmacy tools on demand without losing the active page', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 850 });
  await installApiFixture(page, roleUsers.owner);
  await page.goto('/dashboard/owner/overview?workspace=internal&pharmacy_id=101');

  const sidebar = page.locator('aside[aria-label="Dashboard navigation"]');
  await expect(sidebar.getByRole('button', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
  await expect(sidebar.getByRole('button', { name: 'Internal Roster' })).toHaveCount(0);

  await sidebar.getByRole('button', { name: 'Expand Manage Pharmacies subpages' }).click();
  await expect(sidebar.getByRole('button', { name: 'Internal Roster' })).toBeVisible();
  await sidebar.getByRole('button', { name: 'Internal Roster' }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/dashboard/owner/manage-pharmacies/roster');
  await expect(sidebar.getByRole('button', { name: 'Internal Roster' })).toHaveAttribute('aria-current', 'page');

  await sidebar.getByRole('button', { name: 'Collapse Manage Pharmacies subpages' }).click();
  await expect(sidebar.getByRole('button', { name: 'Internal Roster' })).toHaveCount(0);
});

test('collapsed owner icon rail keeps all nested routes available through an accessible submenu', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 820 });
  await installApiFixture(page, roleUsers.owner);
  await page.goto('/dashboard/owner/overview?workspace=internal&pharmacy_id=101');

  const sidebar = page.locator('aside[aria-label="Dashboard navigation"]');
  await sidebar.getByRole('button', { name: 'Collapse sidebar' }).click();
  await sidebar.getByRole('button', { name: 'Manage Pharmacies menu' }).click();
  const flyout = page.getByRole('menu', { name: 'Manage Pharmacies pages' });
  await expect(flyout.getByRole('menuitem', { name: 'My Pharmacies' })).toBeVisible();
  await expect(flyout.getByRole('menuitem', { name: 'Internal Roster' })).toBeVisible();
  await flyout.getByRole('menuitem', { name: 'Internal Roster' }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/dashboard/owner/manage-pharmacies/roster');
  await expect(sidebar.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1281);
});


test('authenticated Owner pages render the public type families rather than system fallbacks', async ({ page }) => {
  await installApiFixture(page, roleUsers.owner);
  await page.goto('/dashboard/owner/overview?workspace=internal&pharmacy_id=101');

  const heading = page.getByRole('heading', { level: 1, name: /Welcome back/ });
  await expect(heading).toBeVisible();
  await expect(heading).toHaveCSS('font-family', /Outfit/);
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);

  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    const loaded = Array.from(document.fonts).filter((face) => face.status === 'loaded');
    return {
      inter: loaded.some((face) => face.family.replaceAll('"', '') === 'Inter'),
      outfit: loaded.some((face) => face.family.replaceAll('"', '') === 'Outfit'),
    };
  });
  expect(fonts).toEqual({ inter: true, outfit: true });
});
