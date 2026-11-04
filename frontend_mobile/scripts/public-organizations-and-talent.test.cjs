const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const read = path => readFileSync(resolve(__dirname, '..', path), 'utf8');
test('public organization reads the established source without exposing account-only fields', () => {
  const src = read('app/explore/organization/[slug].tsx');
  assert.match(src, /getPublicOrganization\(slug\)/);
  assert.match(src, /safePublicUrl\(organization\?\.cover_image_url/);
  assert.match(src, /params: \{ organization: String\(organization\.id\) \}/);
  assert.doesNotMatch(src, /email|bank_details|phone_number/);
});
test('public talent browsing is server-paginated, read-only and gated for contact', () => {
  const src = read('app/explore/talent-board.tsx');
  assert.match(src, /getPublicTalentFeed\(\{ page: 1, page_size: 24 \}\)/);
  assert.match(src, /getPublicTalentFeed\(\{ page: next, page_size: 24 \}\)/);
  assert.match(src, /if \(request !== generation\.current\) return/);
  assert.match(src, /Sign in to contact talent/);
  assert.doesNotMatch(src, /contact_email|phone_number|date_of_birth|profile_email/);
});
