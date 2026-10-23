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
  ownerWithAuthority: {
    id: 7,
    username: 'owner-authority-smoke',
    email: 'owner-authority@example.test',
    role: 'OWNER',
    is_mobile_verified: true,
    memberships: [
      { pharmacy_id: 101, pharmacy_name: 'Owned Pharmacy', role: 'OWNER' },
      { pharmacy_id: 127, pharmacy_name: 'Selected Owned Pharmacy', role: 'OWNER' },
    ],
    pharmacies: [
      { id: 101, name: 'Owned Pharmacy' },
      { id: 127, name: 'Selected Owned Pharmacy' },
    ],
    admin_assignments: [
      { id: 701, pharmacy_id: 101, pharmacy_name: 'Owned Pharmacy', admin_level: 'OWNER', capabilities: baseCapabilities },
      { id: 727, pharmacy_id: 127, pharmacy_name: 'Selected Owned Pharmacy', admin_level: 'OWNER', capabilities: baseCapabilities },
    ],
  },
  ownerWithDelegatedAdmin: {
    id: 8,
    username: 'owner-delegated-smoke',
    email: 'owner-delegated@example.test',
    role: 'OWNER',
    is_mobile_verified: true,
    memberships: [{ pharmacy_id: 101, pharmacy_name: 'Owned Pharmacy', role: 'OWNER' }],
    pharmacies: [{ id: 101, name: 'Owned Pharmacy' }],
    admin_assignments: [
      { id: 801, pharmacy_id: 101, pharmacy_name: 'Owned Pharmacy', admin_level: 'OWNER', capabilities: baseCapabilities },
      { id: 844, pharmacy_id: 144, pharmacy_name: 'Delegated Pharmacy', admin_level: 'MANAGER', capabilities: baseCapabilities },
    ],
  },
  pharmacyManager: {
    id: 9,
    username: 'pharmacy-manager-smoke',
    email: 'pharmacy-manager@example.test',
    role: 'PHARMACY_MANAGER',
    is_mobile_verified: true,
    memberships: [{ pharmacy_id: 155, pharmacy_name: 'Managed Pharmacy', role: 'CONTACT' }],
    admin_assignments: [
      { id: 955, pharmacy_id: 155, pharmacy_name: 'Managed Pharmacy', admin_level: 'MANAGER', capabilities: baseCapabilities },
    ],
  },
  pharmacyManagerNoAssignment: {
    id: 10,
    username: 'pharmacy-manager-unassigned-smoke',
    email: 'pharmacy-manager-unassigned@example.test',
    role: 'PHARMACY_MANAGER',
    is_mobile_verified: true,
    memberships: [],
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

const LOGIN_PATH = '/api/v1/users/login/';
const REFRESH_PATH = '/api/v1/users/token/refresh/';

function isPath(path, expected) {
  return (
    path === expected ||
    path === expected.replace(/^\/api\/v1/, '/api/platform') ||
    path.endsWith(expected.replace(/^\/api/, ''))
  );
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

  expect(new URL(page.url()).pathname).toBe(path.split('?')[0]);
  await expect(page.locator('body')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Page not found');
  await expect(page.locator('body')).not.toContainText('Not Found');
  expect(pageErrors, `page errors while opening ${path}`).toEqual([]);
}


test.describe('session focus reconciliation', () => {
  test('same authenticated user keeps the mounted dashboard on focus', async ({ page }) => {
    const user = JSON.parse(JSON.stringify(roleUsers.pharmacist));
    await installApiFixture(page, user);

    await page.goto('/dashboard/pharmacist/overview');
    await page.waitForLoadState('networkidle');

    await page.evaluate(() => {
      const main = document.querySelector('main');
      if (!main) throw new Error('Dashboard main element was not mounted');
      window.__ctFocusDashboardMain = main;
    });

    // A fresh payload for the same account may legitimately contain updated fields,
    // but it must not unmount the current page and destroy local chat/form/dialog state.
    user.first_name = 'Fresh session payload';
    const sessionResponse = page.waitForResponse(
      (response) => new URL(response.url()).pathname.endsWith('/users/me/'),
    );
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await sessionResponse;
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

    const preserved = await page.evaluate(
      () => window.__ctFocusDashboardMain === document.querySelector('main') && Boolean(window.__ctFocusDashboardMain?.isConnected),
    );
    expect(preserved).toBe(true);
  });

  test('different authenticated user forces a full reload before continuing', async ({ page }) => {
    const user = JSON.parse(JSON.stringify(roleUsers.pharmacist));
    await installApiFixture(page, user);

    await page.goto('/dashboard/pharmacist/overview');
    await page.waitForLoadState('networkidle');

    Object.assign(user, JSON.parse(JSON.stringify(roleUsers.otherstaff)));

    const navigation = page.waitForNavigation({ waitUntil: 'domcontentloaded' });
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await navigation;
    await page.waitForLoadState('networkidle');

    // The new document is the isolation boundary: account A's mounted page state cannot
    // survive while requests are now authenticated as account B.
    expect(new URL(page.url()).pathname).toBe('/dashboard/otherstaff/overview');
  });
});

test('owner CONTACT membership never offers the quit action', async ({ page }) => {
  const owner = JSON.parse(JSON.stringify(roleUsers.owner));
  owner.memberships = [{
    pharmacy_id: 101,
    pharmacy_name: 'Smoke Pharmacy',
    role: 'CONTACT',
    employment_type: 'FULL_TIME',
  }];
  await installApiFixture(page, owner);

  await page.route('**/api/v1/my-memberships/**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return json(route, [{
      id: 1001,
      role: 'CONTACT',
      employment_type: 'FULL_TIME',
      status: 'ACCEPTED',
      is_pharmacy_owner: true,
      is_pharmacy_admin: true,
      admin_level_label: 'Owner',
      pharmacy_detail: {
        id: 101,
        name: 'Smoke Pharmacy',
        suburb: 'Southport',
        state: 'QLD',
        postcode: '4215',
      },
      invited_by_details: null,
    }]);
  });
  await page.route('**/api/v1/pharmacy-admins/my-pending-invitations/**', async (route) => json(route, []));

  await page.goto('/dashboard/admin-invitations');
  await expect(page.getByText('Smoke Pharmacy')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Leave pharmacy' })).toHaveCount(0);
});

test.describe('public/auth wiring', () => {
  const loginAlert = (page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');

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
    await expect(loginAlert(page)).toContainText('Please enter both email and password');
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

    await expect(loginAlert(page)).toContainText('Invalid credentials');
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
  for (const status of [400, 401, 403, 404, 409, 422, 429, 500, 503]) {
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
      if (status >= 500) {
        await expect(loginAlert(page)).toContainText('Service is temporarily unavailable. Please try again shortly.');
      } else {
        await expect(loginAlert(page)).toContainText(`Smoke HTTP ${status}`);
      }
      await expect(page.getByRole('button', { name: 'Login' })).toBeEnabled();
    });
  }

  test('login handles CSRF bootstrap 500/503 outage safely', async ({ page }) => {
    let simulateCsrfOutage = false;
    let loginPostCount = 0;
    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (simulateCsrfOutage && path.endsWith('/users/csrf/')) {
        return json(route, { detail: 'CSRF service down' }, 503);
      }
      const bootstrap = await installLoggedOutBootstrap(route);
      if (bootstrap) return bootstrap;
      if (request.method() === 'POST' && isPath(path, LOGIN_PATH)) {
        loginPostCount += 1;
        return json(route, { detail: 'Invalid credentials' }, 401);
      }
      return json(route, {});
    });

    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
    await page.getByLabel('Email').fill('smoke@example.test');
    await page.getByLabel('Password').fill('wrong-password');
    simulateCsrfOutage = true;
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(loginAlert(page)).toContainText('Service is temporarily unavailable. Please try again shortly.');
    await expect(page.getByRole('button', { name: 'Login' })).toBeEnabled();
    expect(loginPostCount).toBe(0);
  });

  test('login clears a legacy storage-only session and never sends its refresh token', async ({ page }) => {
    const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const expiredAccess = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ exp: 1 })}.sig`;
    const legacyRefresh = 'legacy-refresh-token-smoke';
    const leaks = [];
    page.on('request', (request) => {
      const sent = `${request.url()} ${JSON.stringify(request.headers())} ${request.postData() ?? ''}`;
      if (sent.includes(legacyRefresh)) leaks.push(request.url());
    });
    await page.addInitScript(([access, refresh]) => {
      if (sessionStorage.getItem('ct_legacy_seeded')) return;
      sessionStorage.setItem('ct_legacy_seeded', '1');
      localStorage.setItem('ct_access', access);
      localStorage.setItem('ct_refresh', refresh);
    }, [expiredAccess, legacyRefresh]);
    await page.route('**/api/**', async (route) => {
      const bootstrap = await installLoggedOutBootstrap(route);
      if (bootstrap) return bootstrap;
      return json(route, {});
    });

    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('ct_refresh'))).toBeNull();
    expect(leaks).toEqual([]);
  });

  test('login sanitizes 500 HTML/traceback responses', async ({ page }) => {
    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const apiPath = new URL(request.url()).pathname;
      const bootstrap = await installLoggedOutBootstrap(route);
      if (bootstrap) return bootstrap;
      if (request.method() === 'POST' && isPath(apiPath, LOGIN_PATH)) {
        return route.fulfill({
          status: 500,
          contentType: 'text/html',
          body: '<html><body><h1>Server Error (500)</h1><p>Traceback (most recent call last): ...</p></body></html>',
        });
      }
      return json(route, {});
    });

    await page.goto('/login');
    await page.getByLabel('Email').fill('smoke@example.test');
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(loginAlert(page)).toContainText('Service is temporarily unavailable. Please try again shortly.');
    await expect(page.locator('body')).not.toContainText('Traceback');
    await expect(page.locator('body')).not.toContainText('Server Error (500)');
    await expect(page.getByRole('button', { name: 'Login' })).toBeEnabled();
  });

  test('login redirects unverified email with email_not_verified code', async ({ page }) => {
    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const apiPath = new URL(request.url()).pathname;
      const bootstrap = await installLoggedOutBootstrap(route);
      if (bootstrap) return bootstrap;
      if (request.method() === 'POST' && isPath(apiPath, LOGIN_PATH)) {
        return json(route, { code: 'email_not_verified', detail: 'Please verify your email address.' }, 401);
      }
      return json(route, {});
    });

    await page.goto('/login');
    await page.getByLabel('Email').fill('unverified@example.test');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Login' }).click();
    await page.waitForURL('**/otp-verify');
    expect(new URL(page.url()).pathname).toBe('/otp-verify');
  });

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
    await expect(loginAlert(page)).toContainText('Login failed. Please check your credentials.');
    await expect(page.getByRole('button', { name: 'Login' })).toBeEnabled();
  });

  test('login prevents duplicate submission while request is pending', async ({ page }) => {
    let loginPosts = 0;
    let releaseLogin;
    const holdLogin = new Promise((resolve) => {
      releaseLogin = resolve;
    });

    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const apiPath = new URL(request.url()).pathname;
      const bootstrap = await installLoggedOutBootstrap(route);
      if (bootstrap) return bootstrap;
      if (request.method() === 'POST' && isPath(apiPath, LOGIN_PATH)) {
        loginPosts += 1;
        await holdLogin;
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
    // The button disables before the POST fires (it waits on the CSRF GET), so wait for it.
    await expect.poll(() => loginPosts).toBe(1);

    releaseLogin();
    await expect(loginAlert(page)).toContainText('Invalid credentials');
    await expect(button).toBeEnabled();
  });

  for (const previousOwner of ['9001', null]) {
    test(`login ${previousOwner ? 'as another account wipes the previous account' : 'after browsing anonymously keeps the visitor'}'s browser storage`, async ({ page }) => {
      const userB = roleUsers.pharmacist;
      let current = null;
      await page.route('**/api/**', async (route) => {
        const request = route.request();
        const apiPath = new URL(request.url()).pathname;
        if (request.method() === 'POST' && isPath(apiPath, LOGIN_PATH)) {
          current = userB;
          return json(route, { access: 'smoke-access', refresh: '', user: userB });
        }
        if (apiPath.endsWith('/users/me/') && current) return json(route, current);
        const bootstrap = await installLoggedOutBootstrap(route);
        if (bootstrap) return bootstrap;
        if (request.method() === 'GET') return json(route, { results: [], count: 0, next: null, previous: null });
        return json(route, {});
      });
      await page.goto('/login');
      await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
      const personal = {
        local: ['saved_shift_ids', 'applied_shift_ids', 'applied_slot_ids', 'rejected_shift_ids', 'rejected_slot_ids', 'counter_offer_map'],
        session: ['owner-pharmacy-setup-skipped', 'ct:hub-draft:community', 'ct:comment-draft:7', 'ct:route:/shifts'],
      };
      const device = ['ct-theme-mode', 'ct-dashboard-sidebar-collapsed', 'ct:shift-skill-preset:v1:9001:PHARMACIST'];
      await page.evaluate(({ personal, device, previousOwner }) => {
        for (const key of personal.local) localStorage.setItem(key, '[101]');
        for (const key of personal.session) sessionStorage.setItem(key, 'Private A text');
        for (const key of device) localStorage.setItem(key, 'dark');
        if (previousOwner) { localStorage.setItem('ct:storage-owner', previousOwner); sessionStorage.setItem('ct:storage-owner', previousOwner); }
      }, { personal, device, previousOwner });

      await page.getByLabel('Email').fill(userB.email);
      await page.getByLabel('Password').fill('test-password');
      await page.locator('form button[type="submit"]').click();
      await expect.poll(() => new URL(page.url()).pathname).not.toBe('/login');
      await page.waitForLoadState('networkidle');

      // The signed-in app may rewrite its own markers (e.g. to "[]"); only the first account's values matter.
      const left = await page.evaluate(({ personal, device }) => ({
        personal: [...personal.local.filter((key) => localStorage.getItem(key) === '[101]'), ...personal.session.filter((key) => sessionStorage.getItem(key) === 'Private A text')],
        device: device.filter((key) => localStorage.getItem(key) === 'dark'),
        owner: localStorage.getItem('ct:storage-owner'),
      }), { personal, device });
      if (previousOwner) expect(left.personal).toEqual([]);
      else expect(left.personal).toEqual(expect.arrayContaining(['ct:hub-draft:community', 'ct:comment-draft:7']));
      expect(left.device).toEqual(device);
      expect(left.owner).toBe(String(userB.id));
    });
  }

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


test('timesheets Recalculate uses the established period recalculation contract', async ({ page }) => {
  await installApiFixture(page, roleUsers.admin);

  const observed = {
    recalculate: null,
  };

  await page.route('**/api/v1/pharmacies/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'GET' && path.endsWith('/pharmacies/')) {
      return json(route, [{ id: 101, name: 'Smoke Pharmacy' }]);
    }
    return route.fallback();
  });

  await page.route('**/api/v1/workforce/timesheet-periods/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (request.method() === 'GET' && path.endsWith('/workforce/timesheet-periods/')) {
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

  await page.route('**/api/v1/workforce/timesheets/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'GET') {
      expect(url.searchParams.get('period_id')).toBe('501');
      return json(route, []);
    }
    return route.fallback();
  });

  await page.goto('/dashboard/workforce/timesheets?pharmacy_id=101');
  const recalculateButton = page.getByRole('button', { name: 'Recalculate' });
  await expect(recalculateButton).toBeEnabled();
  await recalculateButton.click();

  await expect(
    page.getByRole('alert').filter({
      hasText: 'Timesheets recalculated from attendance already received',
    }),
  ).toBeVisible();

  expect(observed.recalculate).toEqual({
    method: 'POST',
    path: '/api/v1/workforce/timesheet-periods/501/recalculate/',
    body: { sync: true },
  });
});


test('attendance approval uses existing pharmacy-scoped pending and approve contracts', async ({ page }) => {
  await installApiFixture(page, roleUsers.admin);

  const observed = {
    pendingPharmacyId: null,
    approve: null,
  };

  await page.route('**/api/v1/pharmacies/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'GET' && path.endsWith('/pharmacies/')) {
      return json(route, [{ id: 101, name: 'Smoke Pharmacy' }]);
    }
    return route.fallback();
  });

  await page.route('**/api/v1/attendance/manager/pending/**', async (route) => {
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

  await page.route('**/api/v1/attendance/manager/approve/**', async (route) => {
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
  await expect(page.getByText("Approve Smoke Pharmacist's hours?")).toBeVisible();
  await page.getByRole('button', { name: 'Approve hours' }).click();

  await expect(page.getByRole('alert')).toContainText(
    'Successfully approved shift for Smoke Pharmacist',
  );

  expect(observed.pendingPharmacyId).toBe('101');
  expect(observed.approve).toEqual({
    method: 'POST',
    path: '/api/v1/attendance/manager/approve/',
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

  await page.route('**/api/v1/my-memberships/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === 'GET' && url.pathname.endsWith('/my-memberships/')) {
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

    if (request.method() === 'POST' && url.pathname.endsWith('/my-memberships/701/accept/')) {
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
  await expect(page.getByRole('heading', { name: 'Smoke Pharmacy' })).toBeVisible();

  await page.getByRole('button', { name: 'Accept' }).click();

  await expect(page.getByText('Active', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accept' })).toHaveCount(0);
  expect(observed).toEqual({
    method: 'POST',
    path: '/api/v1/my-memberships/701/accept/',
    body: null,
  });
  expect(listReads).toBeGreaterThanOrEqual(2);
});

for (const { name, status, expectedMessage, responseBody } of [
  {
    name: 'pharmacist membership accept shows 400 detail and leaves pending invitation intact',
    status: 400,
    expectedMessage: 'You already belong to 3 pharmacies.',
    responseBody: { detail: 'You already belong to 3 pharmacies.' },
  },
  {
    name: 'pharmacist membership accept sanitizes 503 HTML traceback with friendly error',
    status: 503,
    expectedMessage: 'Unable to accept membership.',
    responseBody: '<html><body><h1>503 Service Unavailable</h1><p>Traceback (most recent call last): server error</p></body></html>',
  },
]) {
  test(name, async ({ page }) => {
    await installApiFixture(page, roleUsers.pharmacist);

    let acceptPosts = 0;

    await page.route('**/api/v1/my-memberships/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());

      if (request.method() === 'GET' && url.pathname.endsWith('/my-memberships/')) {
        return json(route, [{
          id: 701,
          role: 'PHARMACIST',
          employment_type: 'FULL_TIME',
          job_title: 'Pharmacist',
          is_pharmacy_admin: false,
          status: 'PENDING',
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

      if (request.method() === 'POST' && url.pathname.endsWith('/my-memberships/701/accept/')) {
        acceptPosts += 1;
        if (typeof responseBody === 'string') {
          return route.fulfill({ status, contentType: 'text/html', body: responseBody });
        }
        return json(route, responseBody, status);
      }

      return route.fallback();
    });

    await page.goto('/dashboard/pharmacist/memberships');
    await expect(page.getByRole('heading', { name: 'Smoke Pharmacy' })).toBeVisible();

    const acceptButton = page.getByRole('button', { name: 'Accept' });
    await expect(acceptButton).toBeVisible();
    await expect(acceptButton).toBeEnabled();

    await acceptButton.click();

    await expect(page.getByRole('alert')).toContainText(expectedMessage);
    if (status === 503) {
      await expect(page.locator('body')).not.toContainText('Traceback');
      await expect(page.locator('body')).not.toContainText('503 Service Unavailable');
    }
    await expect(page.getByText('Waiting for you', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Smoke Pharmacy' })).toBeVisible();
    await expect(acceptButton).toBeVisible();
    await expect(acceptButton).toBeEnabled();
    await expect(page.getByText('Active', { exact: true })).toHaveCount(0);
    expect(acceptPosts).toBe(1);
  });
}


test('workforce kiosk revoke uses the existing scoped manager kiosk contract', async ({ page }) => {
  const manager = { ...roleUsers.admin, admin_assignments: roleUsers.admin.admin_assignments.map(assignment => ({ ...assignment, admin_level: 'MANAGER' })) };
  await installApiFixture(page, manager);

  let revoked = false;
  let observed = null;

  await page.route('**/api/v1/pharmacies/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'GET' && path.endsWith('/pharmacies/')) {
      return json(route, [{ id: 101, name: 'Smoke Pharmacy' }]);
    }
    return route.fallback();
  });

  await page.route('**/api/v1/workforce/**', async (route) => {
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

  await page.route('**/api/v1/attendance/manager/kiosk-devices/**', async (route) => {
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
  await page.waitForLoadState('networkidle');
  const kioskTab = page.getByRole('tab', { name: 'Kiosk devices' });
  await expect(kioskTab).toBeEnabled();
  await kioskTab.click();
  await expect(kioskTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Smoke Kiosk')).toBeVisible();

  await page.getByRole('button', { name: 'Revoke' }).click();
  await expect(page.getByText('Revoke kiosk terminal?')).toBeVisible();
  await page.getByRole('button', { name: 'Revoke kiosk' }).click();

  await expect(page.getByText('No kiosk terminals are registered for this pharmacy.')).toBeVisible();
  expect(observed).toEqual({
    method: 'POST',
    path: '/api/v1/attendance/manager/kiosk-devices/',
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

  const adminUrl = new URL(page.url());
  expect(adminUrl.pathname).toBe('/dashboard/admin/101/overview');
  expect(adminUrl.searchParams.get('pharmacy_id')).toBe('101');
  expect(adminUrl.searchParams.get('workspace')).toBe('internal');
});


test.describe('owner/admin persona routing hardening', () => {
  test('genuine owner stale admin URL canonicalizes to owner route and preserves selected pharmacy query', async ({ page }) => {
    await installApiFixture(page, roleUsers.ownerWithAuthority);

    await page.goto('/dashboard/admin/116/shift-center/active?workspace=internal&pharmacy_id=127');
    await page.waitForLoadState('networkidle');

    const url = new URL(page.url());
    expect(url.pathname).toBe('/dashboard/owner/shift-center/active');
    expect(url.searchParams.get('workspace')).toBe('internal');
    expect(url.searchParams.get('pharmacy_id')).toBe('127');
  });

  test('owner-level admin assignment is authority and canonicalizes to owner route', async ({ page }) => {
    await installApiFixture(page, roleUsers.ownerWithAuthority);

    await page.goto('/dashboard/admin/101/invoice');
    await page.waitForLoadState('networkidle');

    const url = new URL(page.url());
    expect(url.pathname).toBe('/dashboard/owner/invoice');
    expect(url.searchParams.get('pharmacy_id')).toBe('101');
  });

  test('owner with a delegated manager assignment can use that exact admin route', async ({ page }) => {
    await installApiFixture(page, roleUsers.ownerWithDelegatedAdmin);

    await page.goto('/dashboard/admin/144/overview?pharmacy_id=101');
    await page.waitForLoadState('networkidle');

    const url = new URL(page.url());
    expect(url.pathname).toBe('/dashboard/admin/144/overview');
    expect(url.searchParams.get('workspace')).toBe('internal');
    expect(url.searchParams.get('pharmacy_id')).toBe('144');
    await expect(page.locator('body')).not.toContainText('Switch to the Admin persona');
  });

  test('delegated admin cannot silently fall back from an unassigned pharmacy route', async ({ page }) => {
    await installApiFixture(page, roleUsers.admin);

    await page.goto('/dashboard/admin/999/overview?pharmacy_id=101');
    await page.waitForLoadState('networkidle');

    const url = new URL(page.url());
    expect(url.pathname).toBe('/dashboard/pharmacist/overview');
    expect(url.pathname).not.toContain('/dashboard/admin/101');
  });

  test('pharmacy manager keeps the existing exact admin workspace behaviour', async ({ page }) => {
    await installApiFixture(page, roleUsers.pharmacyManager);

    await page.goto('/dashboard/admin/155/overview');
    await page.waitForLoadState('networkidle');

    const url = new URL(page.url());
    expect(url.pathname).toBe('/dashboard/admin/155/overview');
    expect(url.searchParams.get('workspace')).toBe('internal');
    expect(url.searchParams.get('pharmacy_id')).toBe('155');

    await expect(page.getByText('Personal profile is optional')).toBeVisible();
    await expect(page.getByText(/stay permanently as a pharmacy-admin account/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pharmacist', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Intern pharmacist' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Dispensary technician' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pharmacy assistant' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pharmacy student' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pharmacy owner' })).toHaveCount(0);
  });

  test('unassigned pharmacy manager lands on admin invitations instead of dead dashboard', async ({ page }) => {
    await installApiFixture(page, roleUsers.pharmacyManagerNoAssignment);

    await page.goto('/dashboard/admin/155/overview');
    await page.waitForLoadState('networkidle');

    expect(new URL(page.url()).pathname).toBe('/dashboard/admin-invitations');
  });

  test('pharmacy manager with a bad admin pharmacy id returns to their real admin home', async ({ page }) => {
    await installApiFixture(page, roleUsers.pharmacyManager);

    await page.goto('/dashboard/admin/999/invoice?workspace=internal&pharmacy_id=999');
    await page.waitForLoadState('networkidle');

    const url = new URL(page.url());
    expect(url.pathname).toBe('/dashboard/admin/155/overview');
    expect(url.searchParams.get('workspace')).toBe('internal');
    expect(url.searchParams.get('pharmacy_id')).toBe('155');
  });

  test('stale admin link for owner authority becomes the equivalent owner route', async ({ page }) => {
    await installApiFixture(page, roleUsers.ownerWithAuthority);

    await page.goto('/dashboard/admin/101');
    await page.waitForLoadState('networkidle');

    const url = new URL(page.url());
    expect(url.pathname).toBe('/dashboard/owner');
    expect(url.searchParams.get('pharmacy_id')).toBe('101');
  });
});
