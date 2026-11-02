import { test } from '@e2e-dev/web';
import { credentials, expect } from 'e2e';

test('real owner login preserves pharmacy scope, cookie session, refresh protection and logout', async ({ app, browser, screen }) => {
  const owner = credentials.user('owner');
  const destination = '/dashboard/owner/overview?workspace=internal&pharmacy_id=1';
  await app.open(`/login?next=${encodeURIComponent(destination)}`);
  await expect(screen.getByLabel('Email', { exact: true })).toBeVisible();
  await app.screenshot('owner-login-before-credentials');
  await screen.getByLabel('Email', { exact: true }).fill(owner.username);
  await screen.getByLabel('Password', { exact: true }).fill(owner.password);
  await screen.getByRole('button', 'Login', { exact: true }).tap();
  await browser.waitForURL(/\/dashboard\/owner\/overview\?/, { timeout: 60_000 });
  const url = new URL(await browser.url());
  expect(url.port).toBe(process.env.E2E_AUTH_DASHBOARD_PORT!);
  expect(url.searchParams.get('pharmacy_id')).toBe('1');
  expect(url.searchParams.get('workspace')).toBe('internal');
  const cookies = await browser.cookies();
  expect(cookies.find(cookie => cookie.name === 'ct_refresh')?.httpOnly).toBe(true);
  expect(cookies.find(cookie => cookie.name === 'ct_access')?.httpOnly).toBe(true);
  const access = cookies.find(cookie => cookie.name === 'ct_access');
  expect(Boolean(access)).toBe(true);
  await browser.setCookies([{ ...access!, expires: 1 }]);
  const refresh = browser.waitForResponse(/\/users\/token\/refresh\/?$/);
  await browser.reload();
  expect((await refresh).status).toBe(200);
  await expect(browser).toHaveURL(url.href);
  const proof = await browser.evaluate(async () => {
    const me = await fetch('/api/v1/users/me/', { credentials: 'include' });
    const denied = await fetch('/api/v1/users/token/refresh/', { method: 'POST', credentials: 'include' });
    return { meStatus: me.status, role: (await me.json()).role, csrfStatus: denied.status };
  });
  expect(proof.meStatus).toBe(200);
  expect(proof.role).toBe('OWNER');
  expect(proof.csrfStatus).toBe(403);
  const logout = browser.waitForResponse(/\/users\/logout\/?$/);
  await browser.goto(`${url.origin}/dashboard/owner/logout`);
  expect((await logout).status).toBe(200);
  await browser.waitForURL(/\/login(?:\?|$)/);
  expect((await browser.cookies()).some(cookie => cookie.name === 'ct_refresh')).toBe(false);
  await browser.goto(url.href);
  await browser.waitForURL(/\/login(?:\?|$)/);
  await expect(screen.getByLabel('Email', { exact: true })).toBeVisible();
});

test('real delegated manager remains confined to the assigned pharmacy', async ({ app, browser, screen }) => {
  const worker = credentials.user('worker');
  await app.open('/login?next=%2Fdashboard%2Fadmin%2F1%2Foverview%3Fworkspace%3Dinternal%26pharmacy_id%3D1');
  await expect(screen.getByLabel('Email', { exact: true })).toBeVisible();
  await app.screenshot('delegated-login-before-credentials');
  await screen.getByLabel('Email', { exact: true }).fill(worker.username);
  await screen.getByLabel('Password', { exact: true }).fill(worker.password);
  await screen.getByRole('button', 'Login', { exact: true }).tap();
  await browser.waitForURL(/\/dashboard\/admin\/1\/overview/, { timeout: 60_000 });
  const proof = await browser.evaluate(async () => {
    const assigned = await fetch('/api/v1/dashboard/owner/?pharmacy_id=1', { credentials: 'include' });
    const unassigned = await fetch('/api/v1/dashboard/owner/?pharmacy_id=2', { credentials: 'include' });
    return { assigned: assigned.status, unassigned: unassigned.status };
  });
  expect(proof.assigned).toBe(200);
  expect(proof.unassigned).toBe(403);
  const origin = new URL(await browser.url()).origin;
  await browser.goto(`${origin}/dashboard/admin/2/overview?workspace=internal&pharmacy_id=2`);
  await browser.waitForURL(/\/dashboard\/pharmacist\/overview/);
});
