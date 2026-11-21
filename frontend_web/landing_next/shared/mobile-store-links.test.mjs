import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';

const file = readFileSync(new URL('./mobile-store-links.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(file, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const scope = { exports: {} };
vm.runInNewContext(js, scope);
const { storeForMobileUserAgent, isPublicContentPath, APP_STORE_URL, PLAY_STORE_URL } = scope.exports;

test('verified App Store and Play Store destinations are platform-specific', () => {
  assert.match(APP_STORE_URL, /id6759088580$/);
  assert.match(PLAY_STORE_URL, /com\.chemisttasker\.app$/);
  assert.equal(storeForMobileUserAgent('Mozilla iPhone Safari'), APP_STORE_URL);
  assert.equal(storeForMobileUserAgent('Mozilla Android Chrome'), PLAY_STORE_URL);
  assert.equal(storeForMobileUserAgent('Mozilla Desktop Chrome'), null);
});
test('banner appears on public content routes, not on sensitive account flows', () => {
  for (const path of ['/', '/blog/my-story', '/news/policy', '/learning', '/hubs/posts/1', '/talent/public-board', '/organization/test','/shifts/public-board']) assert.equal(isPublicContentPath(path), true);
  for (const path of ['/dashboard','/dashboard/owner','/content/editor','/login','/billing','/mobile-checkout-return','/register','/account-deletion']) assert.equal(isPublicContentPath(path), false);
});
