import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const styles = readFileSync(new URL('./styles.ts', import.meta.url), 'utf8');
test('shift centre uses the canonical native design system for cards and statuses', () => {
  assert.match(styles, /borderRadius: radius\.card/);
  assert.match(styles, /fontFamily: font\.outfit\.medium/);
  assert.match(styles, /backgroundColor: colors\.status\.amber\.bg/);
  assert.match(styles, /fontSize: type\.labelSmall\.fontSize/);
});
test('shift statistics wrap on narrower phones and heavy decorative shadows are absent', () => {
  assert.match(styles, /flexWrap: 'wrap'/);
  assert.match(styles, /flexBasis: '30%'/);
  assert.doesNotMatch(styles, /shadowOpacity: 0\.24|shadowOpacity: 0\.12/);
});
