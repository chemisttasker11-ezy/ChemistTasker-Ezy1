// M4-03: executing replacement for the former regexp/source-string paging assertions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createInbox, deferred } = require('../../scripts/m4-notification-harness.cjs');
const note = (id, unread = false) => ({
  id, type: 'message', title: 'Message ' + id, body: 'Work notification',
  read_at: unread ? null : '2026-11-07T01:10:00Z',
  created_at: '2026-11-07T01:00:00Z', payload: {},
});
const page = (results, next = null) => ({
  count: results.length, next: next ? '/api/v1/notifications/?page=2' : null,
  results, previous: null,
});

test('real inbox renders subsequent pages without duplicate items and never posts empty read IDs', async () => {
  const h = createInbox();
  h.waitFor(1, page(Array.from({ length: 20 }, (_, index) => note(index + 1)), true));
  await h.focus();
  h.waitFor(2, page([note(20), note(21)]));
  const nodes = await h.loadOlder();
  assert.deepEqual(h.rows(nodes).map(row => row.id),
    Array.from({ length: 21 }, (_, index) => index + 1));
  assert.equal(h.calls.filter(c => c[0] === 'POST').length, 0);
  h.unmount();
});

test('first-page failure displays retry, retains rows and never masquerades as a successful empty inbox', async () => {
  const h = createInbox();
  h.waitFor(1, page([note(1), note(2)]));
  await h.focus();
  h.waitFor(1, Error('Refresh offline'));
  let nodes = await h.refresh();
  assert.deepEqual(h.rows(nodes).map(row => row.id), [1, 2]);
  assert.match(h.readError(nodes), /Refresh offline/);
  assert.equal(h.rows(nodes).length, 2);
  h.unmount();
});

test('malformed page two fails visibly but leaves good page one intact', async () => {
  const h = createInbox();
  h.waitFor(1, page([note(1)], true));
  await h.focus();
  h.waitFor(2, { error: 'malformed response' });
  const nodes = await h.loadOlder();
  assert.deepEqual(h.rows(nodes).map(n => n.id), [1]);
  assert.match(h.readError(nodes), /Unexpected notifications response/i);
  h.unmount();
});

test('current manual read failure preserves unread row until a successful server confirmation', async () => {
  const h = createInbox();
  h.waitFor(1, page([note(1, true)]));
  h.waitForMark(Error('Auto mark offline'));
  await h.focus();
  h.waitForMark(Error('Manual mark offline'));
  let nodes = await h.press(1, true);
  assert.equal(h.rows(nodes)[0].readAt, null);
  assert.equal(h.events.length, 0);
  h.waitForMark({ marked: 1, unread: 0 });
  nodes = await h.press(1, true);
  assert.ok(h.rows(nodes)[0].readAt);
  assert.equal(h.events.length, 1);
  h.unmount();
});
