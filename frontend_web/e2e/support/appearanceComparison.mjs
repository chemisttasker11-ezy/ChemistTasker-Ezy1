import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

// Geometry recorded from the unchanged approved views. Never derive exclusions
// solely from current geometry: moving or resizing an input must fail as well.
export const dateGeometry = {
  invoices: [{ x: 1033, y: 594, width: 170, height: 40.125 }, { x: 1215, y: 594, width: 170, height: 40.125 }],
  'shift-filters': [{ x: 388, y: 684.15625, width: 274, height: 40 }, { x: 388, y: 736.15625, width: 274, height: 40 }],
};
export function compareOutsideDateText(actualBuffer, expectedBuffer, boxes) {
  const actual = PNG.sync.read(actualBuffer);
  const expected = PNG.sync.read(expectedBuffer);
  if (actual.width !== expected.width || actual.height !== expected.height) throw new Error('Screenshot dimensions changed');
  for (const box of boxes) {
    // Exclude native locale placeholder glyphs only; keep borders, padding,
    // calendar icon, surrounding label and every other screen pixel compared.
    const left = Math.round(box.x + 14), top = Math.round(box.y + 10);
    for (let y = top; y < top + 20; y++) for (let x = left; x < left + 106; x++) {
      const offset = (y * actual.width + x) * 4;
      actual.data.fill(0, offset, offset + 4);
      expected.data.fill(0, offset, offset + 4);
    }
  }
  const diff = new PNG({ width: actual.width, height: actual.height });
  const pixels = pixelmatch(actual.data, expected.data, diff.data, actual.width, actual.height, { threshold: 0.2 });
  return { pixels, diff: PNG.sync.write(diff) };
}
export async function assertAppearanceOutsideDateText(page, testInfo, name, view) {
  const expectedBoxes = dateGeometry[view];
  const expected = await readFile(testInfo.snapshotPath(name));
  let actual, comparison;
  try {
    // Match toHaveScreenshot's bounded retry while workspace reconciliation
    // settles. Every attempt still checks fixed geometry and all other pixels.
    await expect(async () => {
      const boxes = await page.locator('input[type="date"]').evaluateAll(inputs => inputs.map(input => {
        const { x, y, width, height } = input.getBoundingClientRect();
        return { x, y, width, height };
      }));
      expect(boxes).toHaveLength(expectedBoxes.length);
      for (let index = 0; index < boxes.length; index++) for (const key of ['x', 'y', 'width', 'height']) {
        expect(boxes[index][key], `Date input ${index} ${key}`).toBeCloseTo(expectedBoxes[index][key], 1);
      }
      actual = await page.screenshot({ animations: 'disabled', caret: 'hide' });
      comparison = compareOutsideDateText(actual, expected, expectedBoxes);
      expect(comparison.pixels, 'Appearance outside native date placeholder glyphs').toBe(0);
    }).toPass({ timeout: 8_000, intervals: [100, 250, 500] });
  } catch (error) {
    if (actual && comparison) {
      await testInfo.attach('actual', { body: actual, contentType: 'image/png' });
      await testInfo.attach('outside-date-text-diff', { body: comparison.diff, contentType: 'image/png' });
    }
    throw error;
  }
}
