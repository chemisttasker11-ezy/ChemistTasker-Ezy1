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
  // Changed (gate fix 3): the create intent is now durable before create is sent, so the first write
  // passes and the pause holds the create receipt write that follows it.
  h.pauseNextWrite().resolve();
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
  // intentional (orchestrator D125): an unchanged draft is not re-saved; the pending submit is resent with its key and version
  assert.equal(h.callsOf('update').length, 0);
  assert.equal(h.callsOf('submit').length, 2);
  assert.equal(h.callsOf('submit')[1].version, 1);
  assert.equal(h.callsOf('submit')[1].key, h.callsOf('submit')[0].key);
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

test('R retained Photos removes a previously uploaded image before retrying submission', async () => {
  const h = createMarketplace();
  await h.setDraft(1001, {});
  h.env.stack = ['photos'];
  await h.render();
  h.click('Continue');
  h.env.stack.push('audience');
  await h.render();
  h.click('Review');
  h.env.stack.push('review');
  await h.render();
  h.queue('submit', Error('Submission unavailable'));
  h.click('Submit for review');
  await settle(h);
  assert.equal(h.callsOf('upload').length, 1);
  assert.equal(h.callsOf('submit').length, 1);
  assert.deepEqual(h.callsOf('submit')[0].images, [17]);
  assert.equal(h.nav.filter(row => row[0] === 'replace').length, 0);

  h.env.stack.pop();
  await h.render();
  h.env.stack.pop();
  await h.render();
  h.click('Remove');
  await settle(h);
  assert.deepEqual(h.callsOf('delete').map(call => call.id), [17]);
  assert.deepEqual(Array.from((await h.getDraft(1001)).image_uris), []);
  h.click('Continue');
  h.env.stack.push('audience');
  await h.render();
  h.click('Review');
  h.env.stack.push('review');
  await h.render();
  h.click('Submit for review');
  await settle(h);
  assert.equal(h.callsOf('create').length, 1);
  assert.equal(h.callsOf('upload').length, 1);
  assert.equal(h.callsOf('submit').length, 2);
  assert.deepEqual(h.callsOf('submit')[1].images, []);
  assert.equal(h.nav.filter(row => row[0] === 'replace').length, 1);
  h.unmount();
});

test('R retained Photos waits for pending upload metadata before deleting and retrying', async () => {
  const h = createMarketplace();
  await h.setDraft(1001, {});
  h.env.stack = ['photos'];
  await h.render();
  h.click('Continue');
  h.env.stack.push('audience');
  await h.render();
  h.click('Review');
  h.env.stack.push('review');
  await h.render();

  const uploading = deferred();
  h.queue('upload', uploading);
  h.queue('submit', Error('Submission unavailable'));
  h.click('Submit for review');
  await settle(h);
  assert.equal(h.callsOf('upload').length, 1);
  const pendingMetadataWrite = h.pauseNextWrite();
  uploading.resolve({ id: 17, moderation_status: 'PENDING' });
  await settle(h);
  assert.equal(h.callsOf('submit').length, 0, 'review is waiting for the durable upload receipt');

  // Native stack back navigation retains the original Photos screen instance.
  // Its in-memory draft does not know the uploaded server image id yet.
  h.env.stack.pop();
  await h.render();
  h.env.stack.pop();
  await h.render();
  h.click('Remove');
  await settle(h);
  assert.equal(h.callsOf('delete').length, 0, 'delete must wait for the draft write to settle');

  pendingMetadataWrite.resolve();
  await settle(h);
  assert.deepEqual(h.callsOf('delete').map(call => call.id), [17],
    'Photos must reload the authoritative upload id after the pending write');
  const saved = await h.getDraft(1001);
  assert.deepEqual(Array.from(saved.image_uris), []);
  assert.deepEqual(Array.from(saved.uploaded_image_uris), []);
  assert.equal(saved.uploaded_image_ids['file:///photo-1'], undefined);

  h.click('Continue');
  h.env.stack.push('audience');
  await h.render();
  h.click('Review');
  h.env.stack.push('review');
  await h.render();
  h.click('Submit for review');
  await settle(h);
  assert.equal(h.callsOf('create').length, 1, 'retry uses the existing listing receipt');
  assert.equal(h.callsOf('upload').length, 1, 'removed photo is not uploaded again');
  assert.deepEqual(h.callsOf('submit').at(-1).images, [], 'removed image is never submitted');
  h.unmount();
});

test('R remounted Review retry waits for the pending upload receipt and never re-uploads', async () => {
  const h = createMarketplace();
  await h.setDraft(1001, {});
  h.env.stack = ['photos', 'audience', 'review'];
  await h.render();

  const uploading = deferred();
  h.queue('upload', uploading);
  h.queue('upload', { id: 18, moderation_status: 'PENDING' });
  h.click('Submit for review');
  await settle(h);
  assert.equal(h.callsOf('upload').length, 1);
  const pendingReceiptWrite = h.pauseNextWrite();
  uploading.resolve({ id: 17, moderation_status: 'PENDING' });
  await settle(h);
  assert.equal(h.callsOf('submit').length, 0, 'first attempt is waiting for the durable upload receipt');

  // Back to Audience unmounts Review; opening Review again is a fresh instance.
  h.env.stack.pop();
  await h.render();
  h.env.stack.push('review');
  await h.render();
  h.click('Submit for review');
  await settle(h);
  assert.equal(h.callsOf('upload').length, 1, 'retry must wait for the pending receipt write');

  pendingReceiptWrite.resolve();
  await settle(h);
  assert.equal(h.callsOf('create').length, 1, 'retry uses the existing listing receipt');
  assert.equal(h.callsOf('upload').length, 1, 'uploaded photo is not uploaded again');
  assert.deepEqual(h.callsOf('submit').at(-1).images, [17], 'submitted draft has the latest receipt');
  assert.equal(h.nav.filter(row => row[0] === 'replace').length, 1);
  h.unmount();
});

async function failedSubmitThenBackToAudience() {
  const h = createMarketplace();
  await h.setDraft(1001, { image_uris: [], private_pickup_details: 'OLD pickup' });
  h.env.stack = ['audience', 'review'];
  await h.render();
  h.queue('submit', Error('Submission unavailable'));
  h.click('Submit for review');
  await settle(h);
  assert.equal(h.callsOf('create').length, 1);
  assert.equal(h.callsOf('submit').length, 1);
  h.env.stack.pop();
  await h.render();
  return h;
}

test('R retry after a queued pickup edit sends the settled saved draft, not stale Review props', async () => {
  const h = await failedSubmitThenBackToAudience();
  const pendingEdit = h.pauseNextWrite();
  const pickup = h.currentNodes().find(node => node.type === 'Field' &&
    node.props.label === 'Private pickup details');
  pickup.props.onChangeText('NEW pickup');
  await settle(h);
  // Reopen Review at once: its load reads storage before the edit is saved.
  h.env.stack.push('review');
  await h.render();
  h.click('Submit for review');
  await settle(h);
  assert.equal(h.callsOf('update').length, 0, 'retry waits for the queued edit');
  pendingEdit.resolve();
  await settle(h);
  assert.equal(h.callsOf('create').length, 1, 'retry reuses the listing receipt');
  assert.equal(h.callsOf('update').length, 1);
  assert.equal(h.callsOf('update')[0].body.private_pickup_details, 'NEW pickup');
  assert.equal(h.callsOf('submit').length, 2);
  assert.equal(h.nav.filter(row => row[0] === 'replace').length, 1);
  h.unmount();
});

test('C retry with no edit resends the pending submit with the same key', async () => {
  const h = await failedSubmitThenBackToAudience();
  h.env.stack.push('review');
  await h.render();
  h.click('Submit for review');
  await settle(h);
  assert.equal(h.callsOf('create').length, 1);
  // intentional (orchestrator D125): an unchanged draft is not re-saved before the pending submit is resent
  assert.equal(h.callsOf('update').length, 0);
  assert.equal(h.callsOf('submit').length, 2);
  assert.equal(h.callsOf('submit')[1].key, h.callsOf('submit')[0].key);
  assert.equal(h.nav.filter(row => row[0] === 'replace').length, 1);
  h.unmount();
});
