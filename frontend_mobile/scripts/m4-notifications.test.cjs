const test = require('node:test');
const assert = require('node:assert/strict');
const { createInbox, deferred } = require('./m4-notification-harness.cjs');

const notice = (id, opts = {}) => ({
  id, type: opts.type || 'message', title: opts.title || 'Notification ' + id,
  body: opts.body || 'A new task is available',
  created_at: '2026-11-07T01:00:00Z',
  read_at: opts.unread ? null : '2026-11-07T01:10:00Z',
  payload: opts.payload || {}, action_url: opts.actionUrl || '',
});
const page = (records, next = null) => ({
  count: records.length + (next ? 20 : 0),
  next: next ? 'https://api.example.test/api/v1/notifications/?page=' + next : null,
  previous: null, results: records,
});
const twenty = (start = 1) => Array.from({ length: 20 }, (_, i) => notice(start + i));

test('R same_account_refocus_failure_keeps_rows and retry obtains updated same-account data', async () => {
  const h = createInbox();
  h.waitFor(1, page(twenty(), 2));
  let nodes = await h.focus();
  assert.equal(h.rows(nodes).length, 20);
  h.waitFor(1, Error('Network unavailable'));
  nodes = await h.refocus();
  assert.equal(h.rows(nodes).length, 20, 'same-user refocus must never erase loaded rows');
  assert.match(h.readError(nodes), /Network unavailable|Could not load notifications/i);
  assert.equal(h.rows(nodes)[0].id, 1);
  h.waitFor(1, page(twenty(100), null));
  nodes = await h.refresh();
  assert.deepEqual(Array.from(h.rows(nodes), row => row.id), twenty(100).map(row => row.id));
  assert.equal(h.readError(nodes).includes('Network unavailable'), false);
  h.unmount();
});

test('C account_change_clears_before_network and old page1 completion cannot cross identities', async () => {
  const h = createInbox();
  h.waitFor(1, page(twenty(1)));
  await h.focus();
  const previousRequest = deferred();
  h.waitFor(1, previousRequest);
  await h.refresh();
  const nextRequest = deferred();
  h.waitFor(1, nextRequest);
  h.scope.user = { id: 2002, role: 'EXPLORER' };
  let nodes = await h.settle();
  assert.deepEqual(Array.from(h.rows(nodes)), [], 'new account must never show previous account rows');
  previousRequest.resolve(page(twenty(50)));
  await h.flush();
  nodes = await h.settle();
  assert.deepEqual(Array.from(h.rows(nodes)), [], 'stale page must not restore old data');
  nextRequest.resolve(page([notice(8001)]));
  await h.flush();
  nodes = await h.settle();
  assert.deepEqual(Array.from(h.rows(nodes), row => row.id), [8001]);
  h.scope.user = null;
  nodes = await h.settle();
  assert.deepEqual(Array.from(h.rows(nodes)), [], 'signout clears all private list rows');
  const networkCount = h.calls.filter(([method]) => method === 'GET').length;
  await h.settle();
  assert.equal(h.calls.filter(([method]) => method === 'GET').length, networkCount,
    'signed-out screen must not make an authenticated request');
  h.unmount();
});

for (const outcome of ['resolve', 'reject']) {
  test('R individual_receipt_after_account_switch_is_ignored (' + outcome + ')', async () => {
    const h = createInbox();
    h.waitFor(1, page([notice(101, { unread: true })]));
    h.waitForMark(Error('Initial auto-read failed'));
    let nodes = await h.focus();
    assert.equal(h.rows(nodes)[0].readAt, null);
    const late = deferred();
    h.waitForMark(late);
    await h.press(101, true);
    h.waitFor(1, page([notice(7001)]));
    h.scope.user = { id: 2003, role: 'OTHER_STAFF' };
    nodes = await h.settle();
    assert.equal(h.rows(nodes).some(row => row.id === 101), false);
    if (outcome === 'resolve') late.resolve({ marked: 1, unread: 0 });
    else late.reject(Error('Stale receipt refused'));
    await h.flush();
    nodes = await h.settle();
    assert.deepEqual(Array.from(h.rows(nodes), row => row.id), [7001]);
    assert.equal(h.events.length, 0, 'a previous-account receipt must not emit a badge update');
    assert.equal(h.readError(nodes).includes('Stale receipt refused'), false);
    h.unmount();
  });
}

test('C failed current receipt stays unread, successful retry marks and emits once', async () => {
  const h = createInbox();
  h.waitFor(1, page([notice(45, { unread: true })]));
  h.waitForMark(Error('Auto-read offline'));
  let nodes = await h.focus();
  assert.equal(h.rows(nodes)[0].readAt, null);
  h.waitForMark(Error('Still offline'));
  nodes = await h.press(45, true);
  assert.equal(h.rows(nodes)[0].readAt, null);
  assert.match(h.readError(nodes), /Still offline|read status/i);
  assert.equal(h.events.length, 0);
  h.waitForMark({ marked: 1, unread: 0 });
  nodes = await h.press(45, true);
  assert.ok(h.rows(nodes)[0].readAt, 'read_at only after server confirms');
  assert.equal(h.events.length, 1);
  assert.equal(h.calls.filter(([method, ids]) => method === 'POST' && ids.length === 0).length, 0,
    'never submit empty IDs: server treats this as mark-all');
  h.unmount();
});

test('C full page2 de-duplication, failed page2 retry and retained read receipt', async () => {
  const h = createInbox();
  h.waitFor(1, page(twenty(1), 2));
  let nodes = await h.focus();
  assert.equal(h.rows(nodes).length, 20);
  h.waitFor(2, Error('Page 2 interrupted'));
  nodes = await h.loadOlder();
  assert.equal(h.rows(nodes).length, 20);
  assert.match(h.readError(nodes), /Page 2 interrupted/i);
  h.waitFor(2, page([notice(20), notice(21)]));
  nodes = await h.loadOlder();
  assert.equal(h.rows(nodes).length, 21);
  assert.equal(new Set(Array.from(h.rows(nodes), row => row.id)).size, 21);
  assert.deepEqual(Array.from(h.rows(nodes)).slice(-2).map(row => row.id), [20, 21]);
  const olderCalls = h.calls.filter(([method, pageNum]) => method === 'GET' && pageNum === 2);
  assert.equal(olderCalls.length, 2);
  h.unmount();
});

test('C stale pagination and refresh-finally do not clear a newer account loading state', async () => {
  const h = createInbox();
  h.waitFor(1, page(twenty(), 2));
  await h.focus();
  const oldPage2 = deferred();
  h.waitFor(2, oldPage2);
  await h.loadOlder();
  const newFirstPage = deferred();
  h.waitFor(1, newFirstPage);
  h.scope.user = { id: 2004, role: 'EXPLORER' };
  let nodes = await h.settle();
  assert.deepEqual(h.rows(nodes), []);
  oldPage2.resolve(page([notice(21)]));
  await h.flush();
  nodes = await h.settle();
  assert.deepEqual(h.rows(nodes), []);
  newFirstPage.resolve(page([notice(3001)]));
  await h.flush();
  nodes = await h.settle();
  assert.deepEqual(Array.from(h.rows(nodes), row => row.id), [3001]);
  h.unmount();
});

test('C authorized public shift and chat notification tap preserves persona-aware navigation', async () => {
  const h = createInbox();
  h.scope.user = { id: 2005, role: 'EXPLORER' };
  h.scope.pathname = '/explorer/notifications';
  h.waitFor(1, page([
    notice(71, { type: 'shift_application',
      actionUrl: '/dashboard/explorer/shifts/public?ref=notice' }),
    notice(72, { type: 'message', payload: { room_id: 200 } }),
  ]));
  await h.focus();
  await h.press(71);
  assert.ok(h.routes.at(-1).startsWith('/explorer/shifts'));
  await h.press(72);
  assert.ok(h.routes.at(-1).includes('/messages/200'));
  h.unmount();
});
