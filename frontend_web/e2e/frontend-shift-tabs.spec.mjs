import { test, expect } from '@playwright/test';
import { installApiFixture, roleUsers } from './support/apiFixture.mjs';
import { reviewApi } from './support/reviewFixture.mjs';

// Both shift boards share the same five-tab control; at 390px each tab must remain legible.
for (const area of ['public', 'community']) {
  test(`${area} shift list tabs fit without overlap on narrow phones`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 960 });
    await installApiFixture(page, roleUsers.pharmacist, reviewApi());
    await page.goto(`/dashboard/pharmacist/shifts/${area}`);
    const tabs = page.getByRole('tablist', { name: 'Shift lists' }).getByRole('tab');
    await expect(tabs).toHaveCount(5);
    const rectangles = await tabs.evaluateAll(nodes => nodes.map(node => {
      const box = node.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom,
        scrollWidth: node.scrollWidth, clientWidth: node.clientWidth };
    }));
    for (const tab of rectangles) {
      expect(tab.scrollWidth, 'Tab text must fit in the cell').toBeLessThanOrEqual(tab.clientWidth + 1);
    }
    for (let i = 0; i < rectangles.length; i++) for (let j = i + 1; j < rectangles.length; j++) {
      const a = rectangles[i], b = rectangles[j];
      const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      expect(overlapX <= 0 || overlapY <= 0, 'Five navigation tabs must not overlap').toBe(true);
    }
  });
}
