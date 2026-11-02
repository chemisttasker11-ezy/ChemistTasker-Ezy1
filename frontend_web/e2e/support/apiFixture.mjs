// Shared API fixture for the browser suites: mocked users per persona and a catch-all ChemistTasker API.
// Tests pass `extra(route, { path, method, url })` to answer specific endpoints first; return undefined to fall through.
export const baseCapabilities = ['MANAGE_STAFF', 'MANAGE_ROSTER', 'MANAGE_ADMINS', 'MANAGE_COMMUNICATIONS'];

export const roleUsers = {
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

/** Answers with JSON and resolves to true, so a test's `extra` handler can return it to mark a route handled. */
export async function json(route, value, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(value),
  });
  return true;
}

function isRefreshPath(path) {
  return path === '/api/v1/users/token/refresh/' || path.endsWith('/users/token/refresh/');
}

export async function installApiFixture(page, user, extra) {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    // Only mock ChemistTasker's API. Third-party URLs such as Google Maps
    // also contain "/api/" and must be allowed to load as JavaScript.
    if (!path.startsWith('/api/')) return route.continue();

    if (path.startsWith('/api/') && extra) {
      const handled = await extra(route, { path, method, url });
      if (handled !== undefined) return handled;
    }
    if (path.endsWith('/users/me/')) return json(route, user);
    if (path.endsWith('/users/csrf/')) return json(route, { csrfToken: 'breadth-csrf' });
    if (isRefreshPath(path)) return json(route, { access: 'breadth-access', refresh: '' });

    if (path.includes('/chat/rooms')) return json(route, { results: [], count: 0, next: null, previous: null });
    if (path.endsWith('/rooms/shift-contacts/')) return json(route, []);
    if (path.includes('/notifications')) return json(route, { results: [], unread_count: 0, count: 0 });
    if (path.endsWith('/pharmacies/')) return json(route, []);
    if (path.endsWith('/my-memberships/')) return json(route, []);
    if (path.endsWith('/attendance/worker/cover-terms/')) return json(route, []);
    if (path.endsWith('/attendance/manager/kiosk-review/pending/')) return json(route, []);
    if (path.endsWith('/attendance/worker/status/')) {
      return json(route, { has_active_session: false, session_id: null, pharmacy_id: null, pharmacy_name: null });
    }
    if (path.endsWith('/attendance/roster/worker/')) return json(route, { shifts: [] });
    if (path.endsWith('/attendance/manager/pending/')) return json(route, []);
    if (path.endsWith('/workforce/roster/workspace/')) {
      return json(route, {
        period_id: 501,
        draft_revision: 1,
        published_revision: 0,
        validation: { errors: [], warnings: [] },
        summary: { coverage_shortfalls: 0 },
        coverage_view: [],
      });
    }
    if (path.endsWith('/workforce/leave/')) return json(route, []);
    if (path.endsWith('/workforce/timesheet-periods/')) return json(route, []);
    if (path.endsWith('/workforce/timesheets/')) return json(route, []);
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
