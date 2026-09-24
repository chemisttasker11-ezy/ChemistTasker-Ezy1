import { test, expect } from '@playwright/test';

const baseCapabilities = ['MANAGE_STAFF', 'MANAGE_ROSTER', 'MANAGE_ADMINS', 'MANAGE_COMMUNICATIONS'];

const roleUsers = {
  owner: {
    id: 1,
    username: 'owner-smoke',
    email: 'owner@example.test',
    role: 'OWNER',
    is_mobile_verified: true,
    memberships: [{ pharmacy_id: 101, pharmacy_name: 'Smoke Pharmacy', role: 'OWNER' }],
    pharmacies: [{ id: 101, name: 'Smoke Pharmacy' }],
    admin_assignments: [],
  },
  admin: {
    id: 2,
    username: 'admin-smoke',
    email: 'admin@example.test',
    role: 'PHARMACIST',
    is_mobile_verified: true,
    memberships: [{ pharmacy_id: 101, pharmacy_name: 'Smoke Pharmacy', role: 'PHARMACIST', employment_type: 'FULL_TIME' }],
    admin_assignments: [{ id: 201, pharmacy_id: 101, pharmacy_name: 'Smoke Pharmacy', admin_level: 'FULL_ADMIN', capabilities: baseCapabilities }],
  },
  organization: {
    id: 3,
    username: 'org-smoke',
    email: 'org@example.test',
    role: 'ORG_ADMIN',
    is_mobile_verified: true,
    memberships: [{ organization_id: 301, organization_name: 'Smoke Org', role: 'ORG_ADMIN', capabilities: baseCapabilities, pharmacies: [{ id: 101, name: 'Smoke Pharmacy' }] }],
    admin_assignments: [],
  },
  pharmacist: {
    id: 4,
    username: 'pharmacist-smoke',
    email: 'pharmacist@example.test',
    role: 'PHARMACIST',
    is_mobile_verified: true,
    memberships: [{ pharmacy_id: 101, pharmacy_name: 'Smoke Pharmacy', role: 'PHARMACIST', employment_type: 'FULL_TIME' }],
    admin_assignments: [],
  },
  otherstaff: {
    id: 5,
    username: 'staff-smoke',
    email: 'staff@example.test',
    role: 'OTHER_STAFF',
    is_mobile_verified: true,
    memberships: [{ pharmacy_id: 101, pharmacy_name: 'Smoke Pharmacy', role: 'OTHER_STAFF', employment_type: 'PART_TIME' }],
    admin_assignments: [],
  },
  explorer: {
    id: 6,
    username: 'explorer-smoke',
    email: 'explorer@example.test',
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

const LOGIN_PATH = '/api/users/login/';
const REFRESH_PATH = '/api/users/token/refresh/';

function isPath(path, expected) {
  return path === expected || path.endsWith(expected.replace(/^\/api/, ''));
}

async function installLoggedOutBootstrap(route) {
  const request = route.request();
  const path = new URL(request.url()).pathname;
  if (path.endsWith('/users/me/')) {
    await json(route, { detail: 'Unauthenticated' }, 401);
    return true;
  }
  if (path.endsWith('/users/csrf/')) {
    await json(route, { csrfToken: 'smoke-csrf' });
    return true;
  }
  if (isPath(path, REFRESH_PATH)) {
    await json(route, { detail: 'Unauthenticated' }, 401);
    return true;
  }
  return false;
}

async function installApiFixture(page, user) {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (path.endsWith('/users/me/')) return json(route, user);
    if (path.endsWith('/users/csrf/')) return json(route, { csrfToken: 'smoke-csrf' });
    if (isPath(path, REFRESH_PATH)) return json(route, { access: 'smoke-access', refresh: '' });
    if (path.includes('/chat/rooms')) return json(route, { results: [], count: 0 });
    if (path.includes('/notifications')) return json(route, { results: [], unread_count: 0, count: 0 });
    if (path.includes('/pharmacies')) return json(route, []);
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
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await installApiFixture(page, user);
  await page.goto(path);
  await page.waitForLoadState('networkidle');

  await expect(page).not.toHaveURL(/\\/login(?:\\?|$)/);
  expect(new URL(page.url()).pathname).toBe(path.split('?')[0]);
  await expect(page.locator('body')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Page not found');
  await expect(page.locator('body')).not.toContainText('Not Found');
  expect(pageErrors, `page errors while opening ${path}`).toEqual([]);
}

test.describe('public/auth wiring', () => {
  test('login requires email and password before any auth request', async ({ page }) => {
    let authPostCount = 0;
    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const bootstrap = await installLoggedOutBootstrap(route);
      if (bootstrap) return bootstrap;
      if (request.method() === 'POST' && isPath(path, LOGIN_PATH)) authPostCount += 1;
      return json(route, { results: [] });
    });

    await page.goto('/login');
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page.getByRole('alert')).toContainText('Please enter both email and password');
    expect(authPostCount).toBe(0);
  });

  test('invalid login uses POST with normalized email and existing payload keys', async ({ page }) => {
    let observed = null;
    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const bootstrap = await installLoggedOutBootstrap(route);
      if (bootstrap) return bootstrap;
      if (request.method() === 'POST' && isPath(path, LOGIN_PATH)) {
        observed = {
          method: request.method(),
          path,
          body: request.postDataJSON(),
          csrf: request.headers()['x-csrftoken'],
          platform: request.headers()['x-client-platform'],
        };
        return json(route, { detail: 'Invalid credentials' }, 401);
      }
      return json(route, {});
    });

    await page.goto('/login');
    await page.getByLabel('Email').fill('SMOKE@EXAMPLE.TEST');
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Login' }).click();

    await expect(page.getByRole('alert')).toContainText('Invalid credentials');
    expect(observed).not.toBeNull();
    expect(observed.method).toBe('POST');
    expect(observed.body).toMatchObject({
      email: 'smoke@example.test',
      password: 'wrong-password',
      remember_me: false,
    });
    expect(observed.csrf).toBe('smoke-csrf');
    expect(observed.platform).toBe('web');
  });
  for (const status of [400, 401, 403, 404, 409, 422, 500]) {
    test(`login handles HTTP ${status} without crashing or spinning forever`, async ({ page }) => {
      await page.route('**/api/**', async (route) => {
        const request = route.request();
        const apiPath = new URL(request.url()).pathname;
        const bootstrap = await installLoggedOutBootstrap(route);
        if (bootstrap) return bootstrap;
        if (request.method() === 'POST' && isPath(apiPath, LOGIN_PATH)) {
          return json(route, { detail: `Smoke HTTP ${status}` }, status);
        }
        return json(route, {});
      });

      await page.goto('/login');
      await page.getByLabel('Email').fill('smoke@example.test');
      await page.getByLabel('Password').fill('wrong-password');
      await page.getByRole('button', { name: 'Login' }).click();
      await expect(page.getByRole('alert')).toContainText(`Smoke HTTP ${status}`);
      await expect(page.getByRole('button', { name: 'Login' })).toBeEnabled();
    });
  }

  test('login handles network failure safely', async ({ page }) => {
    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const apiPath = new URL(request.url()).pathname;
      const bootstrap = await installLoggedOutBootstrap(route);
      if (bootstrap) return bootstrap;
      if (request.method() === 'POST' && isPath(apiPath, LOGIN_PATH)) return route.abort('failed');
      return json(route, {});
    });

    await page.goto('/login');
    await page.getByLabel('Email').fill('smoke@example.test');
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page.getByRole('alert')).toContainText('Login failed. Please check your credentials.');
    await expect(page.getByRole('button', { name: 'Login' })).toBeEnabled();
  });

  test('login prevents duplicate submission while request is pending', async ({ page }) => {
    let loginPosts = 0;
    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const apiPath = new URL(request.url()).pathname;
      const bootstrap = await installLoggedOutBootstrap(route);
      if (bootstrap) return bootstrap;
      if (request.method() === 'POST' && isPath(apiPath, LOGIN_PATH)) {
        loginPosts += 1;
        await new Promise((resolve) => setTimeout(resolve, 300));
        return json(route, { detail: 'Invalid credentials' }, 401);
      }
      return json(route, {});
    });

    await page.goto('/login');
    await page.getByLabel('Email').fill('smoke@example.test');
    await page.getByLabel('Password').fill('wrong-password');
    const button = page.locator('form button[type="submit"]');
    await expect(button).toHaveText('Login');
    await button.click();
    await expect(button).toBeDisabled();
    await page.waitForTimeout(450);
    expect(loginPosts).toBe(1);
    await expect(page.getByRole('alert')).toContainText('Invalid credentials');
  });

});

test.describe('authenticated route skeleton', () => {
  const cases = [
    ['Owner overview', roleUsers.owner, '/dashboard/owner/overview'],
    ['Delegated Admin overview', roleUsers.admin, '/dashboard/admin/101/overview'],
    ['Organisation overview', roleUsers.organization, '/dashboard/organization/overview'],
    ['Pharmacist overview', roleUsers.pharmacist, '/dashboard/pharmacist/overview'],
    ['Other Staff overview', roleUsers.otherstaff, '/dashboard/otherstaff/overview'],
    ['Explorer overview', roleUsers.explorer, '/dashboard/explorer/overview'],
    ['Worker My Hours', roleUsers.pharmacist, '/dashboard/my-hours'],
    ['Worker My Leave', roleUsers.otherstaff, '/dashboard/my-leave'],
    ['Workforce settings', roleUsers.admin, '/dashboard/workforce/settings'],
    ['Timesheets', roleUsers.admin, '/dashboard/workforce/timesheets'],
    ['Attendance approvals', roleUsers.admin, '/dashboard/attendance/reviews'],
    ['Shared Pharmacy Hub', roleUsers.owner, '/dashboard/pharmacy-hub'],
  ];

  for (const [name, user, path] of cases) {
    test(name, async ({ page }) => {
      await openAuthenticatedRoute(page, user, path);
    });
  }
});


test('timesheets Sync now uses existing kiosk status and period recalculation contracts', async ({ page }) => {
  await installApiFixture(page, roleUsers.admin);

  const observed = {
    kiosk: null,
    recalculate: null,
  };

  await page.route('**/api/client-profile/pharmacies/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'GET' && path.endsWith('/client-profile/pharmacies/')) {
      return json(route, [{ id: 101, name: 'Smoke Pharmacy' }]);
    }
    return route.fallback();
  });

  await page.route('**/api/client-profile/workforce/timesheet-periods/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (request.method() === 'GET' && path.endsWith('/client-profile/workforce/timesheet-periods/')) {
      expect(url.searchParams.get('pharmacy_id')).toBe('101');
      return json(route, [{
        id: 501,
        pharmacy_id: 101,
        start_date: '2026-09-14',
        end_date: '2026-09-27',
        status: 'OPEN',
        timezone: 'Australia/Brisbane',
        locked_at: null,
      }]);
    }

    if (request.method() === 'GET' && path.endsWith('/501/summary/')) {
      return json(route, {
        period_id: 501,
        pharmacy_id: 101,
        start_date: '2026-09-14',
        end_date: '2026-09-27',
        status: 'OPEN',
        total_timesheets: 0,
        blocking_timesheets: 0,
        warning_checks: 0,
        pending_leave_requests: 0,
        open_sessions: 0,
        ready_timesheets: 0,
      });
    }

    if (request.method() === 'POST' && path.endsWith('/501/recalculate/')) {
      observed.recalculate = {
        method: request.method(),
        path,
        body: request.postDataJSON(),
      };
      return json(route, { rebuilt: 0 });
    }

    return route.fallback();
  });

  await page.route('**/api/client-profile/workforce/timesheets/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'GET') {
      expect(url.searchParams.get('period_id')).toBe('501');
      return json(route, []);
    }
    return route.fallback();
  });

  await page.route('**/api/client-profile/attendance/manager/kiosk-devices/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'GET') {
      observed.kiosk = {
        method: request.method(),
        path: url.pathname,
        pharmacyId: url.searchParams.get('pharmacy_id'),
      };
      return json(route, { devices: [] });
    }
    return route.fallback();
  });

  await page.goto('/dashboard/workforce/timesheets?pharmacy_id=101');
  const syncButton = page.getByRole('button', { name: 'Sync now' });
  await expect(syncButton).toBeEnabled();
  await syncButton.click();

  await expect(page.getByRole('alert')).toContainText(
    'Timesheets refreshed from all attendance currently received by ChemistTasker',
  );

  expect(observed.kiosk).toEqual({
    method: 'GET',
    path: '/api/client-profile/attendance/manager/kiosk-devices/',
    pharmacyId: '101',
  });
  expect(observed.recalculate).toEqual({
    method: 'POST',
    path: '/api/client-profile/workforce/timesheet-periods/501/recalculate/',
    body: { sync: true },
  });
});


test('attendance approval uses existing pharmacy-scoped pending and approve contracts', async ({ page }) => {
  await installApiFixture(page, roleUsers.admin);

  const observed = {
    pendingPharmacyId: null,
    approve: null,
  };

  await page.route('**/api/client-profile/pharmacies/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'GET' && path.endsWith('/client-profile/pharmacies/')) {
      return json(route, [{ id: 101, name: 'Smoke Pharmacy' }]);
    }
    return route.fallback();
  });

  await page.route('**/api/client-profile/attendance/manager/pending/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'GET') {
      observed.pendingPharmacyId = url.searchParams.get('pharmacy_id');
      return json(route, [{
        provisional_id: 77,
        session_id: 88,
        worker_id: 4,
        worker_name: 'Smoke Pharmacist',
        worker_email: 'pharmacist@example.test',
        started_at: '2026-09-24T08:00:00+10:00',
        ended_at: '2026-09-24T16:00:00+10:00',
        cover_type: 'UNROSTERED_LOCAL',
        source_pharmacy_name: null,
        status: 'PENDING',
        decision_reason: null,
        created_at: '2026-09-24T16:01:00+10:00',
      }]);
    }
    return route.fallback();
  });

  await page.route('**/api/client-profile/attendance/manager/approve/**', async (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      observed.approve = {
        method: request.method(),
        path: new URL(request.url()).pathname,
        body: request.postDataJSON(),
      };
      return json(route, { status: 'APPROVED' });
    }
    return route.fallback();
  });

  await page.goto('/dashboard/attendance/reviews');
  await expect(page.getByText('Smoke Pharmacist')).toBeVisible();

  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Approve Provisional Shift')).toBeVisible();
  await page.getByRole('button', { name: 'Approve & Backfill' }).click();

  await expect(page.getByRole('alert')).toContainText(
    'Successfully approved shift for Smoke Pharmacist',
  );

  expect(observed.pendingPharmacyId).toBe('101');
  expect(observed.approve).toEqual({
    method: 'POST',
    path: '/api/client-profile/attendance/manager/approve/',
    body: {
      provisional_id: 77,
      reason: 'Approved cover shift by pharmacy manager.',
    },
  });
});


test('pharmacist membership accept uses the existing my-memberships action endpoint', async ({ page }) => {
  await installApiFixture(page, roleUsers.pharmacist);

  let listReads = 0;
  let observed = null;

  await page.route('**/api/client-profile/my-memberships/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === 'GET' && url.pathname.endsWith('/client-profile/my-memberships/')) {
      listReads += 1;
      const status = listReads === 1 ? 'PENDING' : 'ACCEPTED';
      return json(route, [{
        id: 701,
        role: 'PHARMACIST',
        employment_type: 'FULL_TIME',
        job_title: 'Pharmacist',
        is_pharmacy_admin: false,
        status,
        created_at: '2026-09-24T10:00:00+10:00',
        pharmacy_detail: {
          id: 101,
          name: 'Smoke Pharmacy',
          suburb: 'Brisbane',
          state: 'QLD',
          postcode: '4000',
        },
        invited_by_details: {
          first_name: 'Smoke',
          last_name: 'Owner',
          email: 'owner@example.test',
        },
      }]);
    }

    if (request.method() === 'POST' && url.pathname.endsWith('/client-profile/my-memberships/701/accept/')) {
      observed = {
        method: request.method(),
        path: url.pathname,
        body: request.postData(),
      };
      return json(route, {
        id: 701,
        role: 'PHARMACIST',
        status: 'ACCEPTED',
        is_active: true,
      });
    }

    return route.fallback();
  });

  await page.goto('/dashboard/pharmacist/memberships');
  await expect(page.getByText('Smoke Pharmacy')).toBeVisible();

  await page.getByRole('button', { name: 'Accept' }).click();

  await expect(page.getByText('Accepted')).toBeVisible();
  expect(observed).toEqual({
    method: 'POST',
    path: '/api/client-profile/my-memberships/701/accept/',
    body: null,
  });
  expect(listReads).toBeGreaterThanOrEqual(2);
});


test('workforce kiosk revoke uses the existing scoped manager kiosk contract', async ({ page }) => {
  await installApiFixture(page, roleUsers.admin);

  let revoked = false;
  let observed = null;

  await page.route('**/api/client-profile/pharmacies/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'GET' && path.endsWith('/client-profile/pharmacies/')) {
      return json(route, [{ id: 101, name: 'Smoke Pharmacy' }]);
    }
    return route.fallback();
  });

  await page.route('**/api/client-profile/workforce/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== 'GET') return route.fallback();

    if (path.endsWith('/workforce/coverage-requirements/')) return json(route, []);
    if (path.endsWith('/workforce/work-settings/')) return json(route, []);
    if (path.endsWith('/workforce/payroll-configuration/')) {
      return json(route, {
        pharmacy_id: 101,
        pharmacy_name: 'Smoke Pharmacy',
        use_chemisttasker_payroll: false,
        requirements: {},
      });
    }
    return route.fallback();
  });

  await page.route('**/api/client-profile/attendance/manager/kiosk-devices/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === 'GET') {
      expect(url.searchParams.get('pharmacy_id')).toBe('101');
      return json(route, {
        devices: revoked ? [] : [{
          id: 901,
          device_name: 'Smoke Kiosk',
          platform: 'WINDOWS',
          client_kind: 'NATIVE_KIOSK',
          app_version: '1.0.0',
          activated_at: '2026-09-20T10:00:00+10:00',
          last_seen_at: '2026-09-24T10:00:00+10:00',
          last_sync_at: '2026-09-24T10:00:00+10:00',
          last_contiguous_sequence: 12,
          is_active: true,
          revoked_at: null,
        }],
      });
    }

    if (request.method() === 'POST') {
      observed = {
        method: request.method(),
        path: url.pathname,
        body: request.postDataJSON(),
      };
      revoked = true;
      return json(route, { status: 'revoked' });
    }

    return route.fallback();
  });

  await page.goto('/dashboard/workforce/settings?pharmacy_id=101');
  await page.getByRole('tab', { name: 'Kiosk devices' }).click();
  await expect(page.getByText('Smoke Kiosk')).toBeVisible();

  await page.getByRole('button', { name: 'Revoke' }).click();
  await expect(page.getByText('Revoke kiosk terminal?')).toBeVisible();
  await page.getByRole('button', { name: 'Revoke kiosk' }).click();

  await expect(page.getByText('No kiosk terminals are registered for this pharmacy.')).toBeVisible();
  expect(observed).toEqual({
    method: 'POST',
    path: '/api/client-profile/attendance/manager/kiosk-devices/',
    body: { device_id: 901 },
  });
});

test('delegated admin direct route preserves requested pharmacy scope', async ({ page }) => {
  await installApiFixture(page, roleUsers.admin);

  // Establish storage on the actual Vite origin instead of relying on about:blank
  // initialization semantics.
  await page.goto('/login');
  await page.evaluate(() => localStorage.setItem('ct-active-persona:2', 'ADMIN:201'));

  await page.goto('/dashboard/admin/101/overview');
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveURL(/\/dashboard\/admin\/101\/overview$/);
});
