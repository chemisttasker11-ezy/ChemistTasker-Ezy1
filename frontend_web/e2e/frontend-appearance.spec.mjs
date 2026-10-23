import { test, expect } from '@playwright/test';
import { installApiFixture, roleUsers } from './support/apiFixture.mjs';
import { reviewApi } from './support/reviewFixture.mjs';

// Browser/font rasterization differs by operating system; CI compares these Windows baselines in its Windows job.
test.skip(process.platform !== 'win32', 'Run the appearance suite on Windows against the captured Windows baselines.');
// The approved baselines use Australian date fields and AEST. GitHub's Windows runner otherwise defaults to US date placeholders and UTC clock formatting.
test.use({ locale: 'en-AU', timezoneId: 'Australia/Brisbane', launchOptions: { args: ['--lang=en-AU'] } });

// Baselines are captured from the branch before the architecture extraction (3df951b), never approved from a changed view.
const views = [
  ['invoices', roleUsers.pharmacist, '/dashboard/pharmacist/invoice', 'Invoices'],
  ['invoice-review', roleUsers.owner, '/dashboard/owner/invoice?invoice=41', 'INV-0041'],
  ['pharmacy-overview', roleUsers.owner, '/dashboard/owner/overview?workspace=internal&pharmacy_id=101&view=pharmacy&pharmacyId=101', 'Smoke Pharmacy'],
  ['pharmacy-settings', roleUsers.owner, '/dashboard/owner/overview?workspace=internal&pharmacy_id=101&view=pharmacy&pharmacyId=101&tab=settings', 'Use ChemistTasker Payroll'],
  ['chat', roleUsers.pharmacist, '/dashboard/pharmacist/chat?conversationId=11', 'A message for the team'],
  ['shift-filters', roleUsers.pharmacist, '/dashboard/pharmacist/shifts/public', 'Job Role'],
];

for (const width of [390, 1440]) for (const mode of ['light', 'dark']) for (const [name, user, url, ready] of views) {
  test(`${name} ${mode} ${width}px keeps its appearance`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    await page.clock.setFixedTime(new Date('2026-10-10T09:00:00Z'));
    await page.addInitScript(mode => localStorage.setItem('ct-theme-mode', mode), mode);
    await installApiFixture(page, user, reviewApi());
    await page.goto(url);
    const readyText = name === 'shift-filters' && width === 390 ? 'No shifts match your search' : ready;
    await expect(page.getByText(readyText, { exact: true }).filter({ visible: true }).first()).toBeVisible();
    if (name === 'shift-filters') await expect(page.getByText('No shifts match your search', { exact: true })).toBeVisible();
    if (name === 'shift-filters' && width === 390) {
      // PR171 intentionally added two navigation rows. Verify the five-item row
      // remains readable rather than silently accepting an overlapping baseline.
      const tabs = page.getByRole('tablist', { name: 'Shift lists' }).getByRole('tab');
      await expect(tabs).toHaveCount(5);
      const rectangles = await tabs.evaluateAll(nodes => nodes.map(node => {
        const box = node.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom,
          scrollWidth: node.scrollWidth, clientWidth: node.clientWidth };
      }));
      for (const tab of rectangles) {
        expect(tab.scrollWidth, 'Shift tab content must fit without clipping').toBeLessThanOrEqual(tab.clientWidth + 1);
      }
      for (let i = 0; i < rectangles.length; i++) for (let j = i + 1; j < rectangles.length; j++) {
        const a = rectangles[i], b = rectangles[j];
        const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        expect(overlapX <= 0 || overlapY <= 0, 'Shift tabs must not overlap on phones').toBe(true);
      }
    }
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready);
    const snapshotName = `${name}-${mode}-${width}.png`;
    await expect(page).toHaveScreenshot(snapshotName, { animations: 'disabled', caret: 'hide', maxDiffPixels: 0 });
  });
}
