const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const read = path => readFileSync(resolve(__dirname, '..', path), 'utf8');

test('public Explore is signed-out readable, but does not bypass setup and verification gates', () => {
  const root = read('app/_layout.tsx');
  assert.match(root, /const isExploreRoute = top === 'explore'/);
  assert.match(root, /const isPublic = isExploreRoute \|\| publicRoutes/);
  assert.match(root, /user && isPublic && !isSharedAuthenticatedRoute && !isExploreRoute/);
  assert.match(root, /user && !user\.is_mobile_verified/);
  assert.match(root, /if \(status\.nextPath\)/);
  assert.match(root, /isPublicShiftRoute\(segments\) \|\| isExploreRoute/);
  assert.match(read('app/login.tsx'), /if \(returnTo\) \{ router\.replace\(returnTo as never\)/);
});
test('Explore is discoverable from signed-out landing and each persona More shell', () => {
  assert.match(read('app/welcome.tsx'), /router\.push\('\/explore'/);
  const more = read('components/shell/MoreScreen.tsx');
  for (const route of ['/explore/learning', '/explore/blog', '/explore/hubs']) assert.ok(more.includes(route));
});
test('public calculator is website-only, not enabled as a mobile dose calculator', () => {
  const index = read('app/explore/index.tsx');
  assert.match(index, /openCalculatorWebsite/);
  assert.doesNotMatch(index, /calculateDose|NATIVE_CALCULATOR\s*=\s*true/);
});
