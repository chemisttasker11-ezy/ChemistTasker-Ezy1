import { test, expect } from '@playwright/test';
import { installApiFixture, roleUsers } from './support/apiFixture.mjs';
import { reviewApi } from './support/reviewFixture.mjs';

/**
 * Integration contract regressions for Vite's private shell. Unlike an ordinary
 * screenshot test these assert the exact transport route, scope and origin.
 * Fake data isolates UI event routing; Django response/permission checks live
 * in the backend contract suite, and full live-service E2E is still required.
 */
for (const persona of ['owner', 'pharmacist', 'otherstaff', 'explorer']) {
  test(`${persona}: Pharmacy Hub remains on the authenticated Vite route and uses existing API`, async ({ page }) => {
    const requests = [];
    await installApiFixture(page, { ...roleUsers[persona], public_community_enabled: true }, (route, ctx) => {
      if (ctx.path === '/api/v1/hub/posts/' || ctx.path === '/api/v1/hub/polls/') {
        requests.push({
          method: ctx.method,
          path: ctx.path,
          scope: ctx.url.searchParams.get('scope'),
          platformHub: ctx.url.searchParams.get('platform_hub'),
        });
      }
      return reviewApi()(route, ctx);
    });

    await page.goto('/dashboard/pharmacy-hub?scope=platform&platform_hub=public');
    await expect(page.getByRole('heading', { name: 'Everyone Hub', exact: true })).toBeVisible();
    await expect.poll(() => requests.filter(r => r.path === '/api/v1/hub/posts/').length).toBeGreaterThan(0);
    await expect.poll(() => requests.filter(r => r.path === '/api/v1/hub/polls/').length).toBeGreaterThan(0);
    expect(new URL(page.url()).pathname).toBe('/dashboard/pharmacy-hub');
    expect(requests.every(r => r.method === 'GET' && r.scope === 'platform' && r.platformHub === 'public')).toBe(true);
  });
}

for (const viewport of [390, 1440]) {
  test(`owner logo is the public site rather than a dashboard route at ${viewport}px`, async ({ page }) => {
    await page.setViewportSize({ width: viewport, height: 900 });
    await installApiFixture(page, roleUsers.owner, (route, ctx) => reviewApi()(route, ctx));
    await page.goto('/dashboard/owner/overview?workspace=internal&pharmacy_id=101');
    const home = page.getByRole('link', { name: 'ChemistTasker home', exact: true }).filter({ visible: true });
    await expect(home).toHaveCount(1);
    const href = await home.getAttribute('href');
    const target = new URL(href, page.url());
    expect(target.pathname).toBe('/');
    expect(target.search).toBe('');
    expect(target.hash).toBe('');
    expect(target.protocol).toMatch(/^https?:$/);
    // Deployment MUST set VITE_PUBLIC_SITE_URL when the public Next origin
    // differs from Vite. This test checks the configured URL when provided.
    if (process.env.EXPECTED_NEXT_ORIGIN) {
      expect(target.origin).toBe(new URL(process.env.EXPECTED_NEXT_ORIGIN).origin);
    }
  });
}
