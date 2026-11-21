import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('native learning queries the published server feed across all pages and preserves filters', () => {
  const source = readFileSync(new URL('./learning.tsx', import.meta.url), 'utf8');
  assert.match(source, /q: appliedQuery \|\| undefined/);
  assert.match(source, /kind: kind === 'all' \? undefined : kind/);
  assert.match(source, /page: nextPage/);
  assert.match(source, /setArticles\(\[\]\)/);
  assert.match(source, /setNextPage\(null\)/);
  assert.match(source, /clearTimeout\(timer\)/);
  assert.doesNotMatch(source, /articles\.filter\(/);
  assert.match(source, /No matching resources/);
});
