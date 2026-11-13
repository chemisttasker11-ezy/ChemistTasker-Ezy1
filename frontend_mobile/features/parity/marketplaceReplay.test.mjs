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

// Gate round 3 (fixes 3-6). Errors carry the transport's status and payload code.
const httpError = (status, code) => Object.assign(Error(code), { status, payload: { code } });
const screenError = h => String(h.currentNodes().find(node => node.type === 'ParityPage')?.props.error ?? '');
// The stored intent record (not the draft) holding `key`.
const intentName = (map, key) => [...map].find(([name, value]) => name !== DRAFT + 1001 && String(value).includes(key))?.[0];
const row = (version, publication_status = 'DRAFT') => ({ id: L1, publication_status, version });
async function lostSubmit(patch = {}) {
  const h = await ready({ image_uris: [], ...patch });
  h.queue('submit', lost());
  h.click('Submit for review'); await settled(h);
  const [first] = h.callsOf('submit');
  assert.equal(first.version, 1);
  return { h, first };
}

test('create: a crash before its frozen body is durable cannot produce a second create', async () => {
  const h = await ready({ image_uris: [], title: 'Frozen title' });
  h.pauseNextWrite(); // the app dies before this write lands
  h.click('Submit for review'); await settled(h);
  assert.equal(h.callsOf('create').length, 0, 'create must not leave before its intent is durable');

  const h2 = h.restart();
  await h2.draftModule.patchMarketplaceDraft('1001', { title: 'Edited after crash' });
  await h2.render();
  h2.click('Submit for review'); await settled(h2);
  const creates = [...h.callsOf('create'), ...h2.callsOf('create')];
  assert.equal(creates.length, 1, 'one create in total');
  assert.equal(creates[0].body.title, 'Edited after crash');
  const frozen = creates[0].persisted.storage.get(intentName(creates[0].persisted.storage, creates[0].body.client_request_id));
  assert.ok(frozen?.includes('Edited after crash'), 'the exact create body is durable before it is sent');
  assert.equal(h2.callsOf('submit').length, 1);
  h2.unmount();
});

test('a corrupt saved upload intent blocks the submission and never duplicates the upload', async () => {
  const h = await ready({ image_uris: ['file:///photo-1'] });
  h.queue('upload', lost());
  h.click('Submit for review'); await settled(h);
  const [first] = h.callsOf('upload');
  const name = intentName(h.storage, first.key);
  assert.ok(name, 'the upload intent is stored');
  h.storage.set(name, '{broken');

  const h2 = h.restart();
  await h2.render();
  h2.click('Submit for review'); await settled(h2);
  assert.deepEqual(mutating(h2), [], 'nothing is sent while the saved change is unreadable');
  assert.match(screenError(h2), /review|check/i);
  assert.equal(h2.storage.get(name), '{broken', 'the record is kept for review');
  assert.equal(durable(h2.files).length, 1, 'the photo copy is kept');
  h2.click('Submit for review'); await settled(h2);
  assert.deepEqual(mutating(h2), [], 'a second press is still blocked');

  // Positive control (D104 review-first recovery): only an explicit clear after review unblocks it.
  h2.click('Clear unreadable saved change'); await settled(h2);
  assert.equal(h2.storage.has(name), false);
  h2.click('Submit for review'); await settled(h2);
  assert.equal(h2.callsOf('upload').length, 1);
  assert.equal(h2.callsOf('submit').length, 1);
  h2.unmount();
});

test('an unreadable saved intent blocks the submission, is kept, and replays its own key once readable', async () => {
  const h = await ready({ image_uris: ['file:///photo-1'] });
  h.queue('upload', lost());
  h.click('Submit for review'); await settled(h);
  const [first] = h.callsOf('upload');
  const name = intentName(h.storage, first.key);
  const saved = h.storage.get(name);
  h.failReads(name);

  const h2 = h.restart();
  await h2.render();
  h2.click('Submit for review'); await settled(h2);
  assert.deepEqual(mutating(h2), [], 'no upload while the intent cannot be read');
  assert.notEqual(screenError(h2), '');
  assert.equal(h2.storage.get(name), saved, 'the record is kept');

  h2.failingReads.delete(name);
  h2.click('Submit for review'); await settled(h2);
  const uploads = h2.callsOf('upload');
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].key, first.key, 'the same key, never a fresh one');
  assert.equal(h2.callsOf('submit').length, 1);
  h2.unmount();
});

test('D125 dashboard: a submitted listing completes without resending', async () => {
  const { h } = await lostSubmit();
  const h2 = h.restart();
  h2.queue('dashboard', [row(2, 'PENDING_REVIEW')]);
  await h2.render();
  h2.click('Submit for review'); await settled(h2);
  assert.deepEqual(mutating(h2), []);
  assert.equal(h2.nav.filter(x => x[0] === 'replace').length, 1);
  assert.equal((await h2.getDraft(1001)).created_listing_id, null);
  h2.unmount();
});

test('D125 dashboard: an unchanged DRAFT at the frozen version resends the same submit', async () => {
  const { h, first } = await lostSubmit();
  const h2 = h.restart();
  h2.queue('dashboard', [row(1)]);
  await h2.render();
  h2.click('Submit for review'); await settled(h2);
  assert.deepEqual(mutating(h2).map(call => [call.step, call.key, call.version]), [['submit', first.key, 1]]);
  assert.equal(h2.nav.filter(x => x[0] === 'replace').length, 1);
  h2.unmount();
});

test('D125 dashboard: an edited DRAFT at the frozen version saves the edit, then submits with a new key', async () => {
  const { h, first } = await lostSubmit();
  const h2 = h.restart();
  h2.queue('dashboard', [row(1)]);
  await h2.draftModule.patchMarketplaceDraft('1001', { title: 'Edited after send' });
  await h2.render();
  h2.click('Submit for review'); await settled(h2);
  assert.deepEqual(mutating(h2).map(call => call.step), ['update', 'submit']);
  assert.equal(h2.callsOf('update')[0].body.title, 'Edited after send');
  assert.equal(h2.callsOf('update')[0].body.expected_version, 1);
  assert.notEqual(h2.callsOf('submit')[0].key, first.key);
  assert.equal(h2.callsOf('submit')[0].version, 2);
  h2.unmount();
});

test('D125 dashboard: a DRAFT at another version is a conflict: reload, keep the edit, submit with a new key', async () => {
  const { h, first } = await lostSubmit();
  const h2 = h.restart();
  h2.server.set(L1, { id: L1, owner: 1001, publication_status: 'DRAFT', version: 3 });
  await h2.draftModule.patchMarketplaceDraft('1001', { title: 'Edited locally' });
  await h2.render();
  h2.click('Submit for review'); await settled(h2);
  assert.deepEqual(mutating(h2), [], 'a conflict is shown, not resolved silently');
  assert.match(screenError(h2), /changed/i);
  const saved = await h2.getDraft(1001);
  assert.equal(saved.created_listing_id, L1, 'the draft is not cleared');
  assert.equal(saved.created_listing_version, 3, 'the listing version is reloaded');
  assert.equal(saved.title, 'Edited locally', 'the user edit is kept');

  h2.click('Submit for review'); await settled(h2);
  assert.deepEqual(mutating(h2).map(call => call.step), ['update', 'submit']);
  assert.equal(h2.callsOf('update')[0].body.expected_version, 3);
  assert.equal(h2.callsOf('update')[0].body.title, 'Edited locally');
  assert.notEqual(h2.callsOf('submit')[0].key, first.key);
  assert.equal(h2.callsOf('submit')[0].version, 4);
  h2.unmount();
});

test('D125 dashboard: a missing listing is terminal and nothing is resent', async () => {
  const { h } = await lostSubmit();
  const h2 = h.restart();
  h2.queue('dashboard', []);
  await h2.render();
  h2.click('Submit for review'); await settled(h2);
  assert.deepEqual(mutating(h2), []);
  assert.match(screenError(h2), /no longer exists/i);
  assert.equal((await h2.getDraft(1001)).created_listing_id, L1, 'kept until the user resolves it');
  h2.click('Submit for review'); await settled(h2);
  assert.deepEqual(mutating(h2), [], 'still not resent');
  assert.match(screenError(h2), /no longer exists/i);
  h2.unmount();
});

test('409 STALE_VERSION on an update reloads the version and keeps the edit (not silent)', async () => {
  const h = await ready({ created_listing_id: L1, created_listing_version: 5, image_uris: [], title: 'My edit' });
  h.server.set(L1, { id: L1, owner: 1001, publication_status: 'DRAFT', version: 7 });
  h.queue('update', httpError(409, 'STALE_VERSION'));
  h.click('Submit for review'); await settled(h);
  assert.equal(h.callsOf('update').length, 1);
  assert.equal(h.callsOf('submit').length, 0);
  assert.match(screenError(h), /changed/i);
  const saved = await h.getDraft(1001);
  assert.equal(saved.title, 'My edit');
  assert.equal(saved.created_listing_version, 7);

  h.click('Submit for review'); await settled(h);
  const updates = h.callsOf('update');
  assert.equal(updates.length, 2);
  assert.equal(updates[1].body.expected_version, 7);
  assert.equal(updates[1].body.title, 'My edit');
  assert.notEqual(updates[1].key, updates[0].key);
  assert.equal(h.callsOf('submit')[0].version, 8);
  h.unmount();
});

test('409 payload mismatch on create is terminal: shown, kept, never resent', async () => {
  const h = await ready({ image_uris: [] });
  h.queue('create', httpError(409, 'IDEMPOTENCY_PAYLOAD_MISMATCH'));
  h.click('Submit for review'); await settled(h);
  const [first] = h.callsOf('create');
  assert.notEqual(screenError(h), '');
  assert.ok(intentName(h.storage, first.body.client_request_id), 'the create intent is kept');
  h.click('Submit for review'); await settled(h);
  assert.equal(h.callsOf('create').length, 1, 'not resent, under any key');
  assert.notEqual(screenError(h), '');
  h.unmount();
});

test('410 on an upload is terminal: shown, kept with its photo copy, never re-uploaded under a new key', async () => {
  const h = await ready({ image_uris: ['file:///photo-1'] });
  h.queue('upload', httpError(410, 'IMAGE_DELETED'));
  h.click('Submit for review'); await settled(h);
  const [first] = h.callsOf('upload');
  assert.notEqual(screenError(h), '');
  assert.ok(intentName(h.storage, first.key), 'the upload intent is kept');
  assert.equal(durable(h.files).length, 1, 'the photo copy is kept');
  h.click('Submit for review'); await settled(h);
  assert.equal(h.callsOf('upload').length, 1, 'never re-uploaded automatically');
  assert.equal(h.callsOf('submit').length, 0);

  // Positive control: the user resolves it explicitly; only then does a new upload go out.
  h.click('Discard saved change'); await settled(h);
  assert.equal(intentName(h.storage, first.key), undefined);
  assert.deepEqual(durable(h.files), []);
  h.click('Submit for review'); await settled(h);
  assert.equal(h.callsOf('upload').length, 2);
  assert.notEqual(h.callsOf('upload')[1].key, first.key);
  assert.equal(h.callsOf('submit').length, 1);
  h.unmount();
});
