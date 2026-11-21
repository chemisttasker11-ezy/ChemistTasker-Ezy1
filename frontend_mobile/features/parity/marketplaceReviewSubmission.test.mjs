// M4-04: real submitted payloads and durable per-account draft effects.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createMarketplace, deferred } = require('../../scripts/m4-marketplace-harness.cjs');

async function ready(patch = {}) {
  const h = createMarketplace();
  await h.setDraft(1001, patch);
  await h.render();
  return h;
}
async function settled(h) {
  for (let i = 0; i < 5; i++) await h.flush();
}

test('C same-account double-tap cannot issue duplicate creates, images or review submission', async () => {
  const h = await ready();
  h.clickSameRender('Submit for review', 2); // same mounted callback, no intermediate render
  await settled(h);
  assert.equal(h.callsOf('create').length, 1, 'synchronous attempt mutex');
  assert.equal(h.callsOf('upload').length, 1);
  assert.equal(h.callsOf('submit').length, 1);
  assert.equal(h.callsOf('submit')[0].version, 1, 'image upload does not alter listing version');
  assert.equal(h.nav.filter(x => x[0] === 'replace').length, 1);
  assert.ok(!(await h.getDraft(1001)).created_listing_id, 'successful completion clears local draft');
  h.unmount();
});

test('C Save private draft uses the existing create path but never submits', async () => {
  const h = await ready({ image_uris: [] });
  h.click('Save private draft');
  await settled(h);
  assert.equal(h.callsOf('create').length, 1);
  assert.equal(h.callsOf('submit').length, 0);
  assert.equal(h.nav.filter(x => x[0] === 'replace').length, 1);
  assert.equal(h.callsOf('create')[0].body.seller_context, 'PERSONAL');
  assert.ok(h.callsOf('create')[0].body.client_request_id, 'server receipt key must not be omitted');
  h.unmount();
});

test('C pharmacy audience uses server-returned version; images do not increment it', async () => {
  const h = await ready({ seller_context: 'PHARMACY', pharmacy: 11,
    maximum_circle: 'BAD' });
  h.click('Submit for review');
  for (let i = 0; i < 30 && !h.callsOf('submit').length; i++) { await h.flush(); await new Promise(resolve => setImmediate(resolve)); }
  assert.equal(h.callsOf('create').length, 1);
  assert.equal(h.callsOf('audience').length, 1);
  assert.equal(h.callsOf('audience')[0].body.current_circle, 'OWNED_CHAIN');
  assert.equal(h.callsOf('audience')[0].body.maximum_circle, 'PLATFORM');
  assert.equal(h.callsOf('audience')[0].body.expected_version, 1);
  assert.equal(h.callsOf('upload').length, 1);
  assert.equal(h.callsOf('submit')[0].version, 2);
  h.unmount();
});

test('R retry after successful create + first image resumes same listing and only missing image', async () => {
  const h = await ready({ image_uris: ['file:///photo-1', 'file:///photo-2'] });
  h.queue('upload', { id: 10, moderation_status: 'PENDING' });
  h.queue('upload', Error('second picture upload failed'));
  h.click('Submit for review');
  await settled(h);
  assert.equal(h.callsOf('create').length, 1);
  assert.equal(h.callsOf('upload').length, 2);
  assert.equal(h.callsOf('submit').length, 0);
  const saved = await h.getDraft(1001);
  assert.ok(saved.created_listing_id);
  assert.equal(saved.created_listing_version, 1);
  assert.deepEqual([...saved.uploaded_image_uris], ['file:///photo-1']);
  assert.equal(h.nav.length, 0);
  // This retry is on the SAME mounted review; not a fresh navigation that
  // happens to reload the draft. The caller must inspect durable progress.
  h.click('Submit for review');
  await settled(h);
  assert.equal(h.callsOf('create').length, 1, 'must UPDATE existing ID rather than create a duplicate');
  assert.equal(h.callsOf('update').length, 1);
  assert.equal(h.callsOf('upload').length, 3, 'first successful image is not uploaded twice');
  assert.equal(h.callsOf('submit').length, 1);
  assert.equal(h.callsOf('submit')[0].version, 2, 'retry update version returned by server');
  h.unmount();
});

test('C failure before create response preserves same idempotency key on retry', async () => {
  const h = await ready({ image_uris: [] });
  h.queue('create', Error('Connection lost before response'));
  h.click('Submit for review');
  await settled(h);
  assert.equal(h.nav.length, 0);
  assert.equal(h.callsOf('create').length, 1);
  const first = h.callsOf('create')[0].body.client_request_id;
  assert.ok(first);
  h.click('Submit for review');
  await settled(h);
  assert.equal(h.callsOf('create').length, 2);
  assert.equal(h.callsOf('create')[1].body.client_request_id, first);
  assert.equal(h.callsOf('submit').length, 1);
  h.unmount();
});

test('C stale listing version 409 retains draft and retry does not silently overwrite', async () => {
  const h = await ready({ created_listing_id: 'a1111111-1111-4111-8111-111111111111',
    created_listing_version: 5, image_uris: [] });
  h.queue('update', Object.assign(Error('Stale listing version'), {
    response: { status: 409, data: { code: 'STALE_VERSION' } },
  }));
  h.click('Submit for review');
  await settled(h);
  assert.equal(h.callsOf('submit').length, 0);
  assert.equal(h.nav.length, 0);
  assert.equal((await h.getDraft(1001)).created_listing_version, 5);
  const tree = h.currentNodes();
  assert.ok(tree.some(n => n.type === 'ParityPage' && String(n.props.error).includes('Stale')),
    'server 409 must remain visible and recoverable');
  h.unmount();
});

test('C local file read fails without starting upload and existing draft remains', async () => {
  const h = await ready();
  h.queueLocal('file:///photo-1', Error('File no longer available'));
  h.click('Submit for review');
  await settled(h);
  assert.equal(h.callsOf('create').length, 1);
  assert.equal(h.callsOf('upload').length, 0);
  assert.equal(h.callsOf('submit').length, 0);
  assert.equal(h.nav.length, 0);
  assert.equal((await h.getDraft(1001)).title, 'Used textbook');
  h.unmount();
});

for (const remove of [true, false]) test(`${remove ? 'R' : 'C'}: native failed submit ${remove ? 'removes uploaded photo on server' : 'retains photo without duplicate upload'}`, async () => {
  const h = await ready(); h.queue('submit', Error('Submit failed'));
  h.click('Submit for review'); await settled(h);
  assert.equal(h.callsOf('upload').length, 1);
  h.env.screen = 'photos'; await h.render();
  let nodes = h.currentNodes();
  assert.equal(nodes.filter(n => n.type === 'Image').length, 1);
  if (remove) { h.click('Remove'); await settled(h); }
  nodes = h.currentNodes();
  const visible = nodes.filter(n => n.type === 'Image').length;
  h.env.screen = 'review'; await h.render();
  nodes = h.currentNodes();
  assert.ok(nodes.some(n => n.type === 'DataRow' && n.props.title === 'Photos' && n.props.subtitle === `${visible} selected`));
  h.click('Submit for review'); await settled(h);
  assert.equal(h.callsOf('upload').length, 1);
  assert.equal(h.callsOf('upload').length - h.callsOf('delete').length, visible);
  assert.equal(h.callsOf('submit').length, 2);
  h.unmount();
});
