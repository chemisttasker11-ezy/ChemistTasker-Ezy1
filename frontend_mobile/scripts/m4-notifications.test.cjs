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

test('C malformed list results preserve rows and show retryable errors', async () => {
  const h = createInbox();
  h.waitFor(1, page(twenty(), 2)); await h.focus();
  const badFirst = deferred(); h.waitFor(1, badFirst);
  await h.refresh();
  assert.equal(h.list().props.refreshControl.props.refreshing, true);
  badFirst.resolve({ results: null, next: null }); await h.flush();
  let nodes = await h.settle();
  assert.deepEqual(Array.from(h.rows(nodes), r => r.id), twenty().map(r => r.id));
  assert.match(h.readError(nodes), /Unexpected notifications response/);
  assert.equal(h.list().props.refreshControl.props.refreshing, false);
  h.waitFor(1, page(twenty(), 2)); nodes = await h.refresh();
  assert.doesNotMatch(h.readError(nodes), /Unexpected notifications response/);
  const badOlder = deferred(); h.waitFor(2, badOlder);
  await h.loadOlder(); badOlder.resolve({ results: {}, next: null }); await h.flush();
  nodes = await h.settle();
  assert.equal(h.rows(nodes).length, 20);
  assert.match(h.readError(nodes), /Unexpected notifications response/);
  assert.match(h.readError(nodes), /Retry older notifications/);
  h.waitFor(2, page([notice(21)])); nodes = await h.loadOlder();
  assert.equal(h.rows(nodes).length, 21);
  assert.doesNotMatch(h.readError(nodes), /Unexpected notifications response/);
  h.unmount();
});

test('C denied admin capability falls back to the account role on notification tap', async () => {
  const h = createInbox();
  h.scope.pathname = '/admin/notifications';
  const response = deferred(); h.waitFor(1, response);
  await h.focus(); response.resolve(page([notice(1, { actionUrl: '/dashboard/calendar?date=2026-11-07' })]));
  await h.flush(); let nodes = await h.settle();
  assert.deepEqual(Array.from(h.rows(nodes), r => r.id), [1]);
  nodes = await h.press(1);
  assert.equal(h.routes.at(-1), '/pharmacist/calendar?date=2026-11-07');
  assert.equal(h.rows(nodes)[0].id, 1);
  h.unmount();
});

test('C old account refresh completion leaves new account refresh pending', async () => {
  const h = createInbox();
  h.waitFor(1, page([notice(1)])); await h.focus();
  const oldRefresh = deferred(); h.waitFor(1, oldRefresh); await h.refresh();
  h.waitFor(1, page([notice(200)]));
  h.scope.user = { id: 2002, role: 'PHARMACIST' };
  let nodes = await h.settle();
  assert.deepEqual(Array.from(h.rows(nodes), r => r.id), [200]);
  const newRefresh = deferred(); h.waitFor(1, newRefresh); await h.refresh();
  assert.equal(h.list().props.refreshControl.props.refreshing, true);
  oldRefresh.resolve(page([notice(50)])); await h.flush(); nodes = await h.settle();
  assert.deepEqual(Array.from(h.rows(nodes), r => r.id), [200]);
  assert.equal(h.list().props.refreshControl.props.refreshing, true);
  newRefresh.resolve(page([notice(201)])); await h.flush(); nodes = await h.settle();
  assert.deepEqual(Array.from(h.rows(nodes), r => r.id), [201]);
  assert.equal(h.list().props.refreshControl.props.refreshing, false);
  h.unmount();
});

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
  h.waitFor(1, page(twenty(1).map(n => ({ ...n, read_at: null })), 2));
  let nodes = await h.focus();
  assert.ok(h.rows(nodes)[19].readAt);
  h.waitFor(2, Error('Page 2 interrupted'));
  nodes = await h.loadOlder();
  assert.equal(h.rows(nodes).length, 20);
  assert.match(h.readError(nodes), /Page 2 interrupted/i);
  h.waitFor(2, page([notice(20, { unread: true }), notice(21)]));
  nodes = await h.loadOlder();
  assert.equal(h.rows(nodes).length, 21);
  assert.ok(h.rows(nodes).find(row => row.id === 20).readAt);
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
  const oldRefresh = deferred();
  h.waitFor(1, oldRefresh);
  await h.refresh();
  assert.equal(h.list().props.refreshControl.props.refreshing, true);
  const newFirstPage = deferred();
  h.waitFor(1, newFirstPage);
  h.scope.user = { id: 2004, role: 'EXPLORER' };
  let nodes = await h.settle();
  assert.deepEqual(h.rows(nodes), []);
  oldPage2.resolve(page([notice(21)]));
  oldRefresh.resolve(page([notice(50)]));
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


test('R account switch invalidates receipt before passive cleanup', async () => {
  const h = createInbox();
  const receipt = deferred();
  h.waitFor(1, page([notice(1, { unread: true })]));
  h.waitForMark(receipt);
  await h.focus();
  h.scope.user = { id: 2002, role: 'PHARMACIST' };
  h.list();
  receipt.resolve({ marked: 1, unread: 0 });
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(h.events.length, 0, 'old receipt emitted before passive cleanup');
  h.unmount();
});

test('R first render after account switch hides old errors and paging', async () => {
  const h = createInbox();
  h.waitFor(1, page(twenty(), 2));
  await h.focus();
  h.waitFor(2, Error('Old account page error'));
  await h.loadOlder();
  h.scope.user = { id: 2002, role: 'PHARMACIST' };
  const list = h.list();
  assert.ok(!list || !h.text(list.props.ListFooterComponent).includes('Old account page error'));
  assert.ok(!list || !h.text(list.props.ListFooterComponent).includes('Load older notifications'));
  h.unmount();
});

test('C double older load and overlapping refreshes honor pending requests', async () => {
  const h = createInbox();
  h.waitFor(1, page(twenty(), 2)); await h.focus();
  const older = deferred(); h.waitFor(2, older);
  const sameList = h.list(); sameList.props.onEndReached(); sameList.props.onEndReached();
  assert.equal(h.calls.filter(c => c[0] === 'GET' && c[1] === 2).length, 1);
  older.resolve(page([notice(21)])); await h.flush(); await h.settle();
  const first = deferred(), second = deferred();
  h.waitFor(1, first); h.waitFor(1, second);
  await h.refresh(); await h.refresh();
  assert.equal(h.list().props.refreshControl.props.refreshing, true);
  first.resolve(page([notice(51)])); await h.flush(); await h.settle();
  assert.equal(h.list().props.refreshControl.props.refreshing, true);
  second.resolve(page([notice(52)])); await h.flush();
  const nodes = await h.settle();
  assert.deepEqual(Array.from(h.rows(nodes), r => r.id), [52]);
  assert.equal(h.list().props.refreshControl.props.refreshing, false);
  h.unmount();
});

test('C confirmed receipt remains read across refocus with stale server data', async () => {
  const h = createInbox();
  h.waitFor(1, page([notice(1, { unread: true })])); await h.focus();
  assert.ok(h.rows(await h.settle())[0].readAt);
  h.waitFor(1, page([notice(1, { unread: true })]));
  const nodes = await h.refocus();
  assert.ok(h.rows(nodes)[0].readAt);
  assert.equal(h.calls.filter(c => c[0] === 'POST').length, 1);
  h.unmount();
});

for (const [name, url, route] of [
  ['calendar', '/dashboard/calendar?date=2026-11-07', '/pharmacist/calendar'],
  ['hub', '/dashboard/pharmacy-hub?scope=platform', '/pharmacist/hub'],
  ['membership', '/dashboard/memberships', '/pharmacist/memberships'],
]) {
  test('C ' + name + ' tap navigates when receipt fails', async () => {
    const h = createInbox();
    h.waitFor(1, page([notice(1, { unread: true, actionUrl: url })]));
    h.waitForMark(Error('Offline')); await h.focus();
    h.waitForMark(Error('Still offline')); const nodes = await h.press(1);
    assert.equal(h.rows(nodes)[0].readAt, null);
    assert.match(h.readError(nodes), /Still offline/);
    assert.ok(h.routes.at(-1).startsWith(route));
    assert.equal(h.events.length, 0);
    h.unmount();
  });
}
