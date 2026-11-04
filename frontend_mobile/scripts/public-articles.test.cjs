const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const read = path => readFileSync(resolve(__dirname, '..', path), 'utf8');

test('all three article feeds call public shared-core with server-side filter and safe pagination', () => {
  const src = read('features/explore/ArticleFeed.tsx');
  assert.match(src, /publicContent\.listArticles\(\{ topic, kind, q:/);
  assert.match(src, /publicContent\.listArticles\(\{ page: nextPage, topic, kind/);
  assert.match(src, /ticket !== requestRef\.current/);
  assert.match(src, /mergePage\(existing, data\.results/);
  assert.match(src, /More articles could not load/);
  for (const kind of ['learning','blog','news']) {
    assert.match(read('app/explore/' + kind + '.tsx'), new RegExp('section="' + kind + '"'));
  }
});
test('article detail reads published content and checks sign-in for comments and reactions', () => {
  const src = read('features/explore/ArticleDetail.tsx');
  assert.match(src, /publicContent\.getArticle\(slug\)/);
  assert.match(src, /publicContent\.listArticleComments\(slug\)/);
  assert.match(src, /if \(!article\?\.comments_open \|\| !user/);
  assert.match(src, /if \(!user\) return requiresSignIn\(\)/);
  assert.match(src, /can_delete/);
  assert.match(src, /returnTo: '\/explore\/article\/'/);
  assert.match(src, /publicWebUrl\('\/' \+ article\.kind/);
});
