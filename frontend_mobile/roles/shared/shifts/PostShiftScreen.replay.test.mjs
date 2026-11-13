// Replay contract: optional Idempotency-Key; unique (user, operation, key) receipt;
// 409 payload mismatch includes existing shift_id; replay rechecks current authorization.
import test from 'node:test';
import assert from 'node:assert/strict';
import { world, postScreen, savedIntents, deferred, flush } from './submissionReplay.test-support.mjs';

test('restart after committed lost response replays one shift with exact key and slots', async () => {
  const w = world();
  const first = await postScreen(w);
  await first.current.handleSubmit();
  assert.equal(w.rows.length, 1, 'first request really committed');
  first.unmount();
  const restarted = await postScreen(w);
  await restarted.current.handleSubmit();
  assert.equal(w.rows.length, 1, 'restart created a second shift');
  assert.equal(w.calls[1].key, w.calls[0].key);
  assert.ok(w.calls[0].key);
  assert.deepEqual(w.calls[1].payload, w.calls[0].payload);
});

test('key and exact payload are durable per account BEFORE create dispatch', async () => {
  const w = world(), screen = await postScreen(w);
  await screen.current.handleSubmit();
  assert.equal(w.calls.length, 1);
  const intents = savedIntents(w.calls[0].stored);
  assert.equal(intents.length, 1, 'create dispatched before its intent was saved');
  assert.equal(intents[0].key, w.calls[0].key);
  assert.deepEqual(intents[0].exactPayload, w.calls[0].payload);
  screen.unmount();
  w.env.userId = 2;
  const other = await postScreen(w);
  await other.current.handleSubmit();
  assert.notEqual(w.calls[1].key, w.calls[0].key);
});

test('ambiguous post is recovered before edited draft uses existing shift edit path', async () => {
  const w = world(), first = await postScreen(w);
  await first.current.handleSubmit(); first.unmount();
  const restarted = await postScreen(w);
  restarted.current.setDescription('Edited after timeout'); restarted.render();
  await restarted.current.handleSubmit();
  assert.equal(w.rows.length, 1, 'ambiguous edit created a second shift');
  assert.deepEqual(w.calls[1].payload, w.calls[0].payload, 'recover the frozen payload first');
  // A later save is an edit, even though this route originally had no edit ID.
  restarted.current.dismissToast();
  restarted.current.setDescription('Later correction'); restarted.render();
  await restarted.current.handleSubmit();
  assert.equal(w.rows.length, 1);
  assert.equal(w.edits.at(-1)?.id, w.rows[0].id);
  assert.equal(w.edits.at(-1)?.payload.description, 'Later correction');
});

test('acknowledged create remains an edit intent until explicit post-another action', async () => {
  const w = world(); w.env.lost = false;
  const first = await postScreen(w);
  await first.current.handleSubmit(); first.unmount();
  const reopened = await postScreen(w);
  reopened.current.setDescription('Correction'); reopened.render();
  await reopened.current.handleSubmit();
  assert.equal(w.rows.length, 1, 'ordinary reopen silently started another create intent');
  assert.equal(w.edits.at(-1)?.id, w.rows[0].id);
});

test('same-render duplicate taps retain the existing synchronous lock', async () => {
  const w = world(); w.env.gate = deferred(); w.env.lost = false;
  const screen = await postScreen(w), submit = screen.current.handleSubmit;
  const a = submit(), b = submit(); await flush();
  assert.equal(w.calls.length, 1);
  w.env.gate.resolve(); await Promise.all([a, b]);
});

test('explicit post-another starts a new key after recovery', async () => {
  const w = world(), first = await postScreen(w);
  await first.current.handleSubmit(); first.unmount();
  const screen = await postScreen(w);
  await screen.current.handleSubmit(); screen.render();
  const action = Object.values(screen.current.explicitActions).find(value => typeof value === 'function');
  assert.ok(action, 'no explicit post-another action is available after recovery');
  await action(); screen.render();
  screen.current.setPharmacyId(7);
  screen.current.setSlots([{ date: '2026-12-02', startTime: '10:00', endTime: '18:00', isRecurring: false }]);
  screen.current.setDescription('Deliberately another shift'); screen.render();
  await screen.current.handleSubmit();
  assert.equal(w.rows.length, 2);
  assert.notEqual(w.calls.at(-1).key, w.calls[0].key);
});

test('account switch during pending request cannot replay old account intent after restart', async () => {
  const w = world(); w.env.gate = deferred();
  const old = await postScreen(w);
  const request = old.current.handleSubmit(); await flush();
  assert.equal(w.rows.length, 1);
  old.unmount(); w.env.userId = 2;
  w.env.gate.resolve(); await request;
  const other = await postScreen(w);
  other.current.setDescription('Other account'); other.render();
  await other.current.handleSubmit();
  assert.equal(w.calls[1].userId, 2);
  assert.notEqual(w.calls[1].key, w.calls[0].key, 'accounts shared an unscoped/missing create key');
  other.unmount(); w.env.userId = 1;
  const restored = await postScreen(w);
  await restored.current.handleSubmit();
  assert.equal(w.rows.filter(row => row.userId === 1).length, 1);
  assert.equal(w.calls.at(-1).key, w.calls[0].key);
});

test('a queued submit callback from the previous account cannot send under the new account', async () => {
  const w = world(), screen = await postScreen(w);
  const oldSubmit = screen.current.handleSubmit;
  w.env.userId = 2; screen.render();
  await oldSubmit();
  assert.equal(w.calls.length, 0, 'previous account draft was sent using the new account');
});

test('recovery saves the edits made after the lost response before success', async () => {
  const w = world(), first = await postScreen(w);
  await first.current.handleSubmit(); first.unmount();
  const retry = await postScreen(w);
  retry.current.setDescription('Changed during recovery'); retry.render();
  await retry.current.handleSubmit();
  assert.equal(w.edits.at(-1)?.payload.description, 'Changed during recovery');
});

test('description-only edit after recovery does not replace slots', async () => {
  const w = world(); w.env.lost = false; const first = await postScreen(w);
  await first.current.handleSubmit(); first.unmount();
  const retry = await postScreen(w);
  retry.current.setDescription('Only description changed'); retry.render();
  await retry.current.handleSubmit();
  assert.ok(w.edits.length);
  assert.equal('slots' in w.edits.at(-1).payload, false, 'unchanged slots would be deleted and recreated');
});

test('description-only recovery keeps existing slot ids and counter-offers', async () => {
  const w = world(); w.env.lost = false; const first = await postScreen(w);
  await first.current.handleSubmit(); first.unmount();
  w.rows[0].slotIds = [17]; w.rows[0].counterOffers = [{ id: 23, slotId: 17 }];
  const retry = await postScreen(w);
  retry.current.setDescription('Only the description'); retry.render();
  await retry.current.handleSubmit();
  assert.deepEqual(w.rows[0].slotIds, [17]);
  assert.deepEqual(w.rows[0].counterOffers, [{ id: 23, slotId: 17 }]);
});
