const test = require('node:test');
const assert = require('node:assert/strict');
const { createMarketplace, deferred } = require('./m4-marketplace-harness.cjs');

async function ready(patch = {}) {
  const h = createMarketplace();
  await h.setDraft(1001, patch);
  await h.setDraft(2002, { title: 'New account goods', image_uris: [] });
  await h.render();
  return h;
}
async function settle(h) {
  for (let i = 0; i < 5; i++) await h.flush();
}
async function switchAccount(h) {
  h.env.user = { id: 2002, role: 'OWNER' };
  await h.render();
}
test('R actual keyed unmount invalidates attempt while fetch is pending', async () => {
  const h = await ready();
  const read = deferred();
  h.queueLocal('file:///photo-1', read);
  h.click('Submit for review');
  await settle(h);
  assert.equal(h.callsOf('local-fetch').length, 1);
  h.unmount();
  read.resolve({ blob: async () => new Blob(['old'], { type: 'image/jpeg' }) });
  await settle(h);
  assert.equal(h.callsOf('upload').length, 0);
  assert.equal(h.callsOf('submit').length, 0);
  assert.equal(h.nav.length, 0);
  assert.equal((await h.getDraft(1001)).title, 'Used textbook');
});

test('R actual keyed unmount invalidates attempt while blob conversion is pending', async () => {
  const h = await ready();
  const blob = deferred();
  h.queueLocal('file:///photo-1', { blob: () => blob.promise });
  h.click('Submit for review');
  await settle(h);
  assert.equal(h.callsOf('upload').length, 0);
  h.unmount();
  blob.resolve(new Blob(['old'], { type: 'image/jpeg' }));
  await settle(h);
  assert.equal(h.callsOf('upload').length, 0);
  assert.equal(h.callsOf('submit').length, 0);
});

test('R durable receipt-store await may complete for old account but may not launch later side effects', async () => {
  const h = await ready({ seller_context: 'PHARMACY', pharmacy: 11 });
  const saving = h.pauseNextWrite();
  h.click('Submit for review');
  await settle(h);
  assert.equal(h.callsOf('create').length, 1);
  assert.equal(h.callsOf('audience').length, 0);
  await switchAccount(h);
  saving.resolve();
  await settle(h);
  assert.equal(h.callsOf('audience').length, 0);
  assert.equal(h.callsOf('upload').length, 0);
  assert.equal(h.callsOf('submit').length, 0);
  assert.equal(h.nav.length, 0);
  assert.equal((await h.getDraft(2002)).title, 'New account goods');
  h.unmount();
});

test('R old upload completion cannot clear or unlock the next account attempt', async () => {
  const h = await ready();
  const uploading = deferred();
  h.queue('upload', uploading);
  h.click('Submit for review');
  await settle(h);
  assert.equal(h.callsOf('upload').length, 1);
  await switchAccount(h);
  const newSubmit = deferred();
  h.queue('create', newSubmit);
  h.click('Submit for review');
  await settle(h);
  assert.equal(h.callsOf('create').length, 2);
  uploading.resolve({ id: 11, moderation_status: 'PENDING' });
  await settle(h);
  assert.equal(h.callsOf('submit').length, 0);
  const pending = h.currentNodes().find(node => node.type === 'Button' &&
    node.props.children === 'Submit for review');
  assert.ok(pending);
  assert.equal(pending.props.disabled, true, 'old completion cannot release Nadia submission mutex');
  newSubmit.resolve({ id: 'a2222222-2222-4222-8222-222222222222', version: 1 });
  await settle(h);
  assert.equal(h.nav.filter(row => row[2] === 2002).length, 1);
  assert.equal(h.nav.filter(row => row[2] === 1001).length, 0);
  h.unmount();
});

test('R failed submit retains durable ID/version and retry can finish using same listing', async () => {
  const h = await ready({ image_uris: [] });
  h.queue('submit', Error('Submission unavailable'));
  h.click('Submit for review');
  await settle(h);
  assert.equal(h.callsOf('create').length, 1);
  assert.equal(h.callsOf('submit').length, 1);
  assert.equal(h.nav.length, 0);
  const first = await h.getDraft(1001);
  assert.ok(first.created_listing_id);
  assert.equal(first.created_listing_version, 1);
  h.click('Submit for review');
  await settle(h);
  assert.equal(h.callsOf('create').length, 1);
  assert.equal(h.callsOf('update').length, 1);
  assert.equal(h.callsOf('submit').length, 2);
  assert.equal(h.callsOf('submit')[1].version, 2);
  assert.equal(h.nav.length, 1);
  h.unmount();
});

test('C pharmacy and personal payloads never mix ownership after a switch', async () => {
  const h = await ready({ seller_context: 'PHARMACY', pharmacy: 11, image_uris: [] });
  const pending = deferred();
  h.queue('create', pending);
  h.click('Submit for review');
  await settle(h);
  await switchAccount(h);
  const nadia = await h.getDraft(2002);
  assert.equal(nadia.seller_context, 'PERSONAL');
  assert.equal(nadia.pharmacy, null);
  pending.resolve({ id: 'a1111111-1111-4111-8111-111111111111', version: 1 });
  await settle(h);
  const writesForNadia = h.callsOf('create').filter(c => c.owner === 2002);
  assert.equal(writesForNadia.length, 0);
  assert.equal(h.callsOf('upload').length, 0);
  h.unmount();
});
