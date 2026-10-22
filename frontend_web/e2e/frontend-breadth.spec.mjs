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
  test(`pharmacy action=${action} link opens only when the API allows editing`, async ({ page }) => {
    await installApiFixture(page, roleUsers.owner);
    let canEdit = true;
    const writes = [];
    await page.route('**/api/v1/pharmacies/**', (route) => {
      const request = route.request();
      if (request.method() !== 'GET') {
        writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
        return json(route, {});
      }
      return json(route, [{ id: 101, name: 'Linked Pharmacy', can_edit: canEdit }]);
    });
    const dialog = page.getByRole('dialog', { name: action === 'edit' ? 'Edit Pharmacy' : 'Delete Pharmacy' });
    // The owner overview's Edit/Delete shortcut is an in-app navigation: a cold load resets the workspace and drops pharmacyId.
    const followLink = async () => {
      await page.goto('/dashboard/owner/manage-pharmacies?workspace=internal&pharmacy_id=101');
      await expect(page.getByText('Linked Pharmacy').first()).toBeVisible();
      await page.evaluate((url) => {
        window.history.pushState({}, '', url);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }, `/dashboard/owner/manage-pharmacies?workspace=internal&pharmacy_id=101&view=detail&pharmacyId=101&action=${action}`);
    };

    await followLink();
    await expect(dialog).toBeVisible();

    canEdit = false;
    await followLink();
    await expect.poll(() => new URL(page.url()).searchParams.get('action')).toBeNull();
    await expect(dialog).toHaveCount(0);
    expect(writes).toEqual([]);
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
