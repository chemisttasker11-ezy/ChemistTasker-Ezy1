// REPLAY-t1 (F2/F3) request contract, driven through the real ReviewStep:
// - create keeps `client_request_id` in the body (receipt LISTING_CREATE);
// - api.updateListing(id, body, key), api.updateAudience(id, body, key),
//   api.actOnListing(id, 'submit', expectedVersion, key) and api.uploadImage(id, formData, key) send
//   `key` as the Idempotency-Key header (receipts LISTING_UPDATE / LISTING_AUDIENCE / LISTING_SUBMIT /
//   IMAGE_UPLOAD). Each operation and each photo has its own UUID key, persisted with its frozen
//   payload in AsyncStorage BEFORE the request leaves; a restart resends the same key and payload
//   first, and later form edits are sent only after that replay is reconciled.
// - photo bytes are copied into app storage (expo-file-system Paths.document) before the first
//   upload and removed once the upload is reconciled.
// "Lost response" = the server committed, the app never saw the reply (the mock throws).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createMarketplace, deferred } = require('../../scripts/m4-marketplace-harness.cjs');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const L1 = 'a1111111-1111-4111-8111-111111111111';
const L2 = 'b2222222-2222-4222-8222-222222222222';
const DRAFT = '@chemisttasker_marketplace_mobile_draft_v2:';
const lost = () => Error('Network lost after the server committed');
const json = value => JSON.stringify(value);
const mutating = h => h.calls.filter(call => ['create', 'update', 'audience', 'upload', 'submit'].includes(call.step));
const storedText = call => [...call.persisted.storage.values()].join('\n');
const storedDraft = (call, scope = 1001) => JSON.parse(call.persisted.storage.get(DRAFT + scope));
const durable = files => [...files.keys()].filter(uri => uri.startsWith('file:///document/'));

async function settled(h) {
  for (let i = 0; i < 8; i++) { await h.flush(); await new Promise(resolve => setImmediate(resolve)); }
}
async function ready(patch = {}, h = createMarketplace()) {
  await h.setDraft(1001, patch);
  await h.render();
  return h;
}
function assertKeyedBeforeSend(call, label) {
  assert.match(String(call.key ?? ''), UUID, `${label} must carry an Idempotency-Key`);
  assert.ok(storedText(call).includes(call.key), `${label} key must be persisted before the request is sent`);
}

test('update: lost response, restart and a later edit resend the frozen intent first, then the edit', async () => {
  const h = await ready({ created_listing_id: L1, created_listing_version: 5, image_uris: [], title: 'Frozen title' });
  h.queue('update', lost());
  h.click('Submit for review'); await settled(h);
  const [first] = h.callsOf('update');
  assertKeyedBeforeSend(first, 'listing update');
  assert.equal(first.body.expected_version, 5);

  const h2 = h.restart();
  await h2.draftModule.patchMarketplaceDraft('1001', { title: 'Edited after send' });
  await h2.render();
  h2.queue('update', { id: L1, version: 6 }); // server replays the original outcome
  h2.click('Submit for review'); await settled(h2);
  const updates = h2.callsOf('update');
  assert.equal(updates[0].key, first.key, 'restart resends the same key');
  assert.equal(json(updates[0].body), json(first.body), 'the edit must not overwrite the pending snapshot');
  assert.equal(updates.length, 2, 'the later edit is sent after the replay is reconciled');
  assert.equal(updates[1].body.title, 'Edited after send');
  assert.equal(updates[1].body.expected_version, 6);
  assert.notEqual(updates[1].key, first.key, 'a new change gets a new key');
  assert.equal(storedDraft(updates[1]).created_listing_version, 6, 'returned version is persisted before the later edit');
  assert.equal(h2.callsOf('submit')[0].version, 7);
  h2.unmount();
});

test('create: lost response and an edit after sending resend the frozen create, then patch the edit', async () => {
  const h = await ready({ image_uris: [], title: 'Frozen title' });
  h.queue('create', lost());
  h.click('Submit for review'); await settled(h);
  const [first] = h.callsOf('create');
  assert.ok(storedText(first).includes(first.body.client_request_id));

  const h2 = h.restart();
  await h2.draftModule.patchMarketplaceDraft('1001', { title: 'Edited after send' });
  await h2.render();
  h2.click('Submit for review'); await settled(h2);
  const creates = h2.callsOf('create');
  assert.equal(creates.length, 1);
  assert.equal(json(creates[0].body), json(first.body), 'same client_request_id and frozen payload');
  const updates = h2.callsOf('update');
  assert.equal(updates.length, 1, 'the edit is applied to the created listing afterwards');
  assert.equal(updates[0].id, L1);
  assert.equal(updates[0].body.title, 'Edited after send');
  assert.equal(updates[0].body.expected_version, 1);
  assertKeyedBeforeSend(updates[0], 'listing update');
  assert.equal(storedDraft(updates[0]).created_listing_id, L1, 'returned id is persisted before the later edit');
  h2.unmount();
});

test('audience: lost response is resent with the same key and body before anything else', async () => {
  const h = await ready({ seller_context: 'PHARMACY', pharmacy: 11, image_uris: [] });
  h.queue('audience', lost());
  h.click('Submit for review'); await settled(h);
  const [first] = h.callsOf('audience');
  assertKeyedBeforeSend(first, 'audience change');

  const h2 = h.restart();
  await h2.render();
  h2.queue('audience', { current_circle: 'OWNED_CHAIN', maximum_circle: 'PLATFORM', version: 2 });
  h2.click('Submit for review'); await settled(h2);
  const [replay] = mutating(h2);
  assert.equal(replay?.step, 'audience', 'the pending audience intent is reconciled first');
  assert.equal(replay.key, first.key);
  assert.equal(json(replay.body), json(first.body));
  assert.equal(h2.callsOf('submit')[0].version, 2);
  h2.unmount();
});

test('submit: lost response replays once with the same key and version, then completes', async () => {
  const h = await ready({ image_uris: [] });
  h.queue('submit', lost());
  h.click('Submit for review'); await settled(h);
  const [first] = h.callsOf('submit');
  assertKeyedBeforeSend(first, 'submit');

  const h2 = h.restart();
  await h2.render();
  h2.click('Submit for review'); await settled(h2);
  const calls = mutating(h2);
  assert.deepEqual(calls.map(call => call.step), ['submit'], 'only the pending submit is resent');
  assert.equal(calls[0].key, first.key);
  assert.equal(calls[0].version, first.version);
  assert.equal(h2.nav.filter(x => x[0] === 'replace').length, 1);
  h2.unmount();
});

test('photo: bytes stay in app storage until reconciled; restart resends the same key and bytes', async () => {
  const h = await ready({ image_uris: ['file:///photo-1', 'file:///photo-2'] });
  h.queue('upload', lost());
  h.click('Submit for review'); await settled(h);
  const [first] = h.callsOf('upload');
  assertKeyedBeforeSend(first, 'photo upload');
  assert.ok(durable(first.persisted.files).length >= 1, 'a durable copy exists before the first upload');
  assert.equal(await first.bytes, 'real-bytes');

  h.purgeLocal('file:///photo-1'); // the OS cleared the picker's temporary file
  const h2 = h.restart();
  await h2.render();
  h2.click('Submit for review'); await settled(h2);
  const uploads = h2.callsOf('upload');
  assert.equal(uploads.length, 2);
  assert.equal(uploads[0].key, first.key, 'photo-1 replays with its own key');
  assert.equal(await uploads[0].bytes, 'real-bytes', 'replayed from the durable copy');
  assert.match(String(uploads[1].key), UUID);
  assert.notEqual(uploads[1].key, first.key, 'each photo has its own key');
  assert.equal(h2.callsOf('submit').length, 1);
  assert.deepEqual(durable(h2.files), [], 'durable copies are removed once reconciled');
  h2.unmount();
});

test('account switch mid-request: no pending intent crosses accounts', async () => {
  const h = createMarketplace();
  await h.setDraft('1001', { created_listing_id: L1, created_listing_version: 5, image_uris: [] });
  await h.setDraft('2002', { title: 'Nadia private draft', created_listing_id: L2, created_listing_version: 3, image_uris: [] });
  await h.render();
  const inFlight = deferred();
  h.queue('update', inFlight);
  h.click('Submit for review');
  for (let i = 0; i < 30 && !h.callsOf('update').length; i++) await settled(h);
  const [tom] = h.callsOf('update');
  assertKeyedBeforeSend(tom, 'listing update');
  h.env.user = { id: 2002, role: 'OWNER' };
  await h.render();
  inFlight.reject(lost());
  await settled(h);
  h.click('Submit for review'); await settled(h);
  const nadia = mutating(h).filter(call => call.owner === 2002);
  assert.ok(nadia.length >= 1, 'the second account sends its own update');
  for (const call of nadia) {
    assert.notEqual(call.key, tom.key, 'no cross-account key');
    assert.notEqual(call.id, L1, 'no cross-account listing');
  }
  assert.match(String(nadia[0].key), UUID);
  h.unmount();
});

test('listing switch: a pending intent for one listing is never sent against another', async () => {
  const h = await ready({ created_listing_id: L1, created_listing_version: 5, image_uris: [] });
  h.queue('update', lost());
  h.click('Submit for review'); await settled(h);
  const [first] = h.callsOf('update');
  assertKeyedBeforeSend(first, 'listing update');
  await h.draftModule.clearMarketplaceDraft('1001');
  await h.setDraft(1001, { created_listing_id: L2, created_listing_version: 3, image_uris: [], title: 'Another listing' });
  const h2 = h.restart();
  await h2.render();
  h2.click('Submit for review'); await settled(h2);
  const updates = h2.callsOf('update');
  assert.ok(updates.some(call => call.id === L2), 'the new listing is saved');
  for (const call of updates) {
    if (call.key === first.key) assert.equal(call.id, L1, 'the old key only replays against its own listing');
    if (call.id === L2) { assert.notEqual(call.key, first.key); assert.match(String(call.key), UUID); }
  }
  h2.unmount();
});
