// M4-04: real keyed wrapper/ReviewStep awaits instead of matching source strings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createMarketplace, deferred } = require('../../scripts/m4-marketplace-harness.cjs');

async function setup(patch = {}) {
  const h = createMarketplace();
  await h.setDraft('1001', patch);
  await h.setDraft('2002', { title: 'Nadia private draft', image_uris: [] });
  await h.render();
  return h;
}
async function waitForCall(h, step) {
  for (let i = 0; i < 30; i++) {
    if (h.callsOf(step).length) return;
    await h.flush();
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.fail('Deferred boundary was not reached: ' + step);
}
async function switched(h) {
  h.env.user = { id: 2002, role: 'OWNER' };
  await h.render(); // actual keyed MarketplaceParityContent unmount, effects/cleanup
}

test('R account_switch_during_fetch_blocks_upload through actual keyed account wrapper', async () => {
  const h = await setup();
  const read = deferred();
  h.queueLocal('file:///photo-1', read);
  h.click('Submit for review');
  await waitForCall(h, 'local-fetch');
  assert.equal(h.callsOf('create').length, 1);
  assert.equal(h.callsOf('local-fetch').length, 1);
  assert.equal(h.callsOf('upload').length, 0);
  await switched(h);
  read.resolve({ blob: async () => new Blob(['former account picture'], { type: 'image/jpeg' }) });
  await h.flush(); await h.flush();
  assert.equal(h.callsOf('upload').length, 0);
  assert.equal(h.callsOf('submit').length, 0);
  assert.equal(h.nav.length, 0);
  const tom = await h.getDraft(1001);
  const nadia = await h.getDraft(2002);
  assert.equal(tom.title, 'Used textbook');
  assert.ok(tom.created_listing_id, 'a valid server create receipt remains resumable');
  assert.equal(nadia.title, 'Nadia private draft');
  assert.equal(nadia.created_listing_id, null);
  h.unmount();
});

test('R account_switch_while_blob_pending_blocks_upload on a retired ReviewStep', async () => {
  const h = await setup();
  const read = deferred();
  h.queueLocal('file:///photo-1', { blob: () => read.promise });
  h.click('Submit for review');
  await waitForCall(h, 'local-fetch');
  assert.equal(h.callsOf('local-fetch').length, 1);
  assert.equal(h.callsOf('upload').length, 0);
  await switched(h);
  read.resolve(new Blob(['former account picture'], { type: 'image/jpeg' }));
  await h.flush(); await h.flush();
  assert.equal(h.callsOf('upload').length, 0);
  assert.equal(h.callsOf('submit').length, 0);
  assert.equal(h.nav.length, 0);
  assert.equal((await h.getDraft(2002)).title, 'Nadia private draft');
  h.unmount();
});

test('R late create response after account unmount cannot start audience/upload/submit', async () => {
  const h = await setup({ seller_context: 'PHARMACY', pharmacy: 11 });
  const created = deferred();
  h.queue('create', created);
  h.click('Submit for review');
  await waitForCall(h, 'create');
  await switched(h);
  created.resolve({ id: 'a1111111-1111-4111-8111-111111111111', version: 1 });
  await h.flush(); await h.flush();
  assert.deepEqual(h.calls.map(c => c.step).filter(x =>
    ['update', 'audience', 'upload', 'submit'].includes(x)), []);
  assert.equal(h.nav.length, 0);
  assert.equal((await h.getDraft(2002)).title, 'Nadia private draft');
  h.unmount();
});

test('R late audience response cannot start previous-account image upload', async () => {
  const h = await setup({ seller_context: 'PHARMACY', pharmacy: 11 });
  const audience = deferred();
  h.queue('audience', audience);
  h.click('Submit for review');
  await waitForCall(h, 'audience');
  assert.equal(h.callsOf('audience').length, 1);
  await switched(h);
  audience.resolve({ current_circle: 'OWNED_CHAIN', maximum_circle: 'PLATFORM', version: 2 });
  await h.flush(); await h.flush();
  assert.equal(h.callsOf('upload').length, 0);
  assert.equal(h.callsOf('submit').length, 0);
  h.unmount();
});

test('R late update response after account switch leaves personal draft intact', async () => {
  const h = await setup({ created_listing_id: 'a1111111-1111-4111-8111-111111111111',
    created_listing_version: 2 });
  const update = deferred();
  h.queue('update', update);
  h.click('Submit for review'); await waitForCall(h, 'update');
  assert.equal(h.callsOf('update').length, 1);
  await switched(h);
  update.resolve({ version: 3 });
  await h.flush();
  assert.equal(h.callsOf('upload').length, 0);
  assert.equal(h.callsOf('submit').length, 0);
  assert.equal((await h.getDraft(2002)).title, 'Nadia private draft');
  h.unmount();
});
