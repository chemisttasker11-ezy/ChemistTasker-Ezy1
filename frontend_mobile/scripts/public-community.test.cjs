const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const read = path => readFileSync(resolve(__dirname, '..', path), 'utf8');

test('public hubs use approved shared-core public endpoints and reliable retry', () => {
  const src = read('app/explore/hubs/index.tsx');
  const feed = read('app/explore/hubs/[hub].tsx');
  assert.match(src, /publicContent\.listHubs\(\)/);
  assert.match(feed, /publicContent\.listCommunityPosts\(hub/);
  assert.match(feed, /publicContent\.listCommunityPolls\(hub/);
  assert.match(feed, /ticket !== generation\.current/);
  assert.match(feed, /setMoreError/);
  assert.match(feed, /info\?\.can_interact && user/);
  assert.match(feed, /poll\.can_interact/);
});
test('public hub details guard mutating operations with current post permissions', () => {
  const post = read('app/explore/hubs/post/[id].tsx');
  assert.match(post, /post\.can_interact/);
  assert.match(post, /post\.allow_comments/);
  assert.match(post, /row\.can_edit/);
  assert.match(post, /safePublicUrl\(file\.url, true\)/);
  assert.match(post, /publicContent\.reportPost/);
  assert.match(post, /publicContent\.deleteCommunityComment/);
});
