import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { compareOutsideDateText } from './appearanceComparison.mjs';

const image = () => { const png = new PNG({ width: 200, height: 80 }); png.data.fill(255); return png; };
const paint = (png, x, y) => {
  for (let row = y; row < y + 4; row++) for (let col = x; col < x + 4; col++) {
    const offset = (row * png.width + col) * 4;
    png.data.fill(0, offset, offset + 3);
  }
};
test('locale glyph variance is bounded to the fixed date text region', () => {
  const expected = PNG.sync.write(image()); const actual = image(); paint(actual, 40, 25);
  assert.equal(compareOutsideDateText(PNG.sync.write(actual), expected, [{ x: 10, y: 10 }]).pixels, 0);
});
test('a change elsewhere or to the date border still fails', () => {
  const expected = PNG.sync.write(image());
  for (const [x, y] of [[150, 50], [10, 10], [140, 25]]) {
    const actual = image(); paint(actual, x, y);
    assert.ok(compareOutsideDateText(PNG.sync.write(actual), expected, [{ x: 10, y: 10 }]).pixels > 0);
  }
});
