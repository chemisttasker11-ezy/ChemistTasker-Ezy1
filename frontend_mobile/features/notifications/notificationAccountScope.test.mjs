// M4-03: replaces source-presence checks with real account/focus transitions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createInbox, deferred } = require('../../scripts/m4-notification-harness.cjs');
const note = (id, readAt = null) => ({
  id, title: 'Scoped ' + id, body: 'Private task', type: 'task',
  created_at: '2026-11-07T01:00:00Z', read_at: readAt, payload: {},
});
const page = (results, next = null) => ({ count: results.length, next, results });

test('new account clears old read receipts and list without waiting for its request', async () => {
  const h = createInbox();
  h.waitFor(1, page([note(100, '2026-11-07T01:05:00Z')]));
  let rows = h.rows(await h.focus());
  assert.deepEqual(rows.map(r => r.id), [100]);
  const newResponse = deferred();
  h.waitFor(1, newResponse);
  h.scope.user = { id: 9002, role: 'OTHER_STAFF' };
  rows = h.rows(await h.settle());
  assert.deepEqual(rows, []);
  newResponse.resolve(page([note(200, null)]));
  await h.flush();
  rows = h.rows(await h.settle());
  assert.deepEqual(rows.map(r => r.id), [200]);
  assert.equal(rows.some(row => row.id === 100), false);
  h.unmount();
});

test('new page-one request releases superseded older load and prevents late old page writes', async () => {
  const h = createInbox();
  h.waitFor(1, page([note(1, '2026-11-07T01:00:00Z')], '/api/v1/notifications/?page=2'));
  await h.focus();
  const page2 = deferred();
  h.waitFor(2, page2);
  await h.loadOlder();
  h.waitFor(1, page([note(100, '2026-11-07T01:10:00Z')]));
  let rows = h.rows(await h.refresh());
  assert.deepEqual(rows.map(r => r.id), [100]);
  page2.resolve(page([note(2)]));
  await h.flush();
  rows = h.rows(await h.settle());
  assert.deepEqual(rows.map(r => r.id), [100]);
  assert.equal(h.calls.filter(([kind, pageNumber]) => kind === 'GET' && pageNumber === 2).length, 1);
  h.unmount();
});
