const test = require('node:test');
const assert = require('node:assert/strict');
const { createMarketplace } = require('./m4-marketplace-harness.cjs');

const texts = nodes => nodes.flatMap(node => [node.props?.title, node.props?.children]).filter(value => typeof value === 'string');

test('R with new listings switched off every editor step shows the closed notice and no form (O4 N3)', async () => {
  for (const screen of ['seller', 'category', 'details', 'photos', 'audience', 'review']) {
    const h = createMarketplace();
    const open = h.api.getListingOptions;
    h.api.getListingOptions = async () => ({ ...(await open()), new_listings_enabled: false });
    await h.setDraft(1001, {});
    h.env.screen = screen;
    await h.render();
    const nodes = h.currentNodes();
    assert.ok(texts(nodes).includes("New listings aren't open yet"), screen);
    assert.equal(nodes.some(node => node.type === 'Field' || node.type === 'Button'), false, screen);
    h.unmount();
  }
  // Switched on (or an older server without the field): the editor shows.
  const h = createMarketplace();
  await h.setDraft(1001, {});
  await h.render();
  assert.equal(texts(h.currentNodes()).includes("New listings aren't open yet"), false);
  assert.ok(h.button('Submit for review'));
});
