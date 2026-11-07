// M4-04 senior: exercise real catalogue/photo callbacks and durable store writes.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMarketplace, deferred } = require('./m4-marketplace-harness.cjs');

const flush = async h => { for (let i = 0; i < 5; i++) await h.flush(); };
async function ready(screen) {
  const h = createMarketplace();
  await h.setDraft(1001, { title: 'Original title', description: 'Original description',
    image_uris: [] });
  h.env.screen = screen;
  await h.render();
  return h;
}
function field(h, label) {
  const node = h.currentNodes().find(n => n.type === 'Field' && n.props.label === label);
  assert.ok(node, 'Real field not rendered: ' + label);
  return node;
}
test('R catalogue lookup result after unmount does not patch the former account draft', async () => {
  const h = await ready('details');
  field(h, 'Barcode / identifier').props.onChangeText('12345');
  await h.render();
  const pending = deferred();
  h.queue('lookup', pending);
  h.click('Look up product');
  await flush(h);
  assert.equal(h.callsOf('lookup').length, 1);
  h.unmount();
  pending.resolve({ results: [{ name: 'Wrong account item', description: 'Private old result' }] });
  await flush(h);
  const d = await h.getDraft(1001);
  assert.equal(d.title, 'Original title');
  assert.equal(d.description, 'Original description');
});
test('R photo picker result after unmount does not write old account photos', async () => {
  const h = await ready('photos');
  const pending = deferred();
  h.queuePhoto(pending);
  h.click('Add photos');
  await flush(h);
  assert.equal(h.callsOf('photo-picker').length, 1);
  h.unmount();
  pending.resolve({ canceled: false, assets: [{ uri: 'file:///former-user.jpg' }] });
  await flush(h);
  assert.deepEqual(Array.from((await h.getDraft(1001)).image_uris), []);
});
test('R concurrent same-scope draft patches preserve both fields despite first read being delayed', async () => {
  const h = await ready('details');
  const firstRead = h.pauseNextRead();
  const a = h.draftModule.patchMarketplaceDraft('1001', { title: 'Updated title' });
  await flush(h);
  const b = h.draftModule.patchMarketplaceDraft('1001', { description: 'Updated description' });
  await flush(h);
  firstRead.resolve();
  await Promise.all([a, b]);
  const actual = await h.getDraft(1001);
  assert.equal(actual.title, 'Updated title');
  assert.equal(actual.description, 'Updated description');
  h.unmount();
});

test('R clear waits for a queued patch and does not resurrect the draft', async () => {
  const h = await ready('details');
  const gate = h.pauseNextRead();
  const patch = h.draftModule.patchMarketplaceDraft('1001', { created_listing_id: 'old-listing' });
  await flush(h);
  const clear = h.draftModule.clearMarketplaceDraft('1001');
  await flush(h);
  gate.resolve();
  await Promise.all([patch, clear]);
  assert.equal((await h.getDraft(1001)).created_listing_id, null);
  h.unmount();
});
