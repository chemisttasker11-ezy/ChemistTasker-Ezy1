// Replay contract: optional Idempotency-Key; unique (user, operation, key) receipt;
// 409 payload mismatch includes existing shift_id; replay rechecks current authorization.
import test from 'node:test';
import assert from 'node:assert/strict';
import { world, offerHook, savedIntents, deferred, flush } from '../../submissionReplay.test-support.mjs';

test('restart reconciles independent pending offers for two shifts with their own keys', async () => {
  const w = world(), first = await offerHook(w);
  await first.open(42, 17); await first.current.handleSubmitCounterOffer();
  w.env.lost = true;
  await first.open(43, 18); await first.current.handleSubmitCounterOffer();
  assert.equal(w.calls.length, 2);
  assert.notEqual(w.calls[0].key, w.calls[1].key);
  first.unmount();
  const restarted = await offerHook(w);
  await restarted.open(42, 17); await restarted.current.handleSubmitCounterOffer();
  await restarted.open(43, 18); await restarted.current.handleSubmitCounterOffer();
  assert.equal(w.rows.length, 2);
  assert.equal(w.calls.length, 4);
  assert.equal(w.calls[2].key, w.calls[0].key);
  assert.equal(w.calls[3].key, w.calls[1].key);
  assert.deepEqual(w.calls[2].payload, w.calls[0].payload);
  assert.deepEqual(w.calls[3].payload, w.calls[1].payload);
});

test('restart after committed lost response resends exact target and slots without second offer', async () => {
  const w = world(), first = await offerHook(w);
  await first.open(); await first.current.handleSubmitCounterOffer();
  assert.equal(w.rows.length, 1, 'first offer committed'); first.unmount();
  const restarted = await offerHook(w);
  await restarted.open(); await restarted.current.handleSubmitCounterOffer();
  assert.equal(w.rows.length, 1, 'restart created a second counter-offer');
  assert.ok(w.calls[0].key);
  assert.equal(w.calls[1].key, w.calls[0].key);
  assert.deepEqual(w.calls[1].payload, w.calls[0].payload);
});

test('counter-offer key, target shift and exact slots persist BEFORE callback dispatch', async () => {
  const w = world(), hook = await offerHook(w);
  await hook.open(); await hook.current.handleSubmitCounterOffer();
  const [intent] = savedIntents(w.calls[0].stored);
  assert.ok(intent, 'offer callback ran before durable intent acquisition');
  assert.equal(intent.key, w.calls[0].key);
  assert.deepEqual(intent.exactPayload, w.calls[0].payload);
  assert.equal(intent.exactPayload.shiftId, 42);
  assert.equal(intent.exactPayload.slots[0].slotId, 17);
});

test('an edited form after restart first reconciles the ambiguous original offer', async () => {
  const w = world(), first = await offerHook(w);
  await first.open(); await first.current.handleSubmitCounterOffer(); first.unmount();
  const restarted = await offerHook(w);
  await restarted.open(42, 18);
  await restarted.current.handleSubmitCounterOffer();
  assert.equal(w.rows.length, 1, 'edited slot silently started a second offer while original was ambiguous');
  assert.deepEqual(w.calls[1].payload, w.calls[0].payload);
});

test('same-render taps retain the current in-memory offer lock', async () => {
  const w = world(); w.env.gate = deferred(); w.env.lost = false;
  const hook = await offerHook(w), board = await hook.open();
  const a = board.handleSubmitCounterOffer(), b = board.handleSubmitCounterOffer(); await flush();
  assert.equal(w.calls.length, 1);
  w.env.gate.resolve(); await Promise.all([a, b]);
});

test('explicit another-offer path permits another slot and intentional offer after recovery', async () => {
  const w = world(), first = await offerHook(w);
  await first.open(); await first.current.handleSubmitCounterOffer(); first.unmount();
  const hook = await offerHook(w);
  await hook.open(); await hook.current.handleSubmitCounterOffer(); hook.render();
  const action = Object.entries(hook.current).find(([name, fn]) => /another/i.test(name) && typeof fn === 'function')?.[1];
  assert.ok(action, 'no explicit another-counter-offer path is available after recovery');
  await action(); await hook.open(42, 18); await hook.current.handleSubmitCounterOffer();
  assert.equal(w.rows.length, 2);
  assert.notEqual(w.calls.at(-1).key, w.calls[0].key);
  assert.equal(w.calls.at(-1).payload.slots[0].slotId, 18);
});

test('account switch mid-request isolates durable retries after both remounts', async () => {
  const w = world(); w.env.gate = deferred();
  const first = await offerHook(w); await first.open();
  const pending = first.current.handleSubmitCounterOffer(); await flush();
  first.unmount(); w.env.userId = 2; w.env.gate.resolve(); await pending;
  const other = await offerHook(w); await other.open(99, 88);
  await other.current.handleSubmitCounterOffer();
  assert.equal(w.calls[1].userId, 2);
  assert.equal(w.calls[1].payload.shiftId, 99);
  assert.notEqual(w.calls[1].key, w.calls[0].key, 'account switch reused an unscoped/missing offer key');
  other.unmount(); w.env.userId = 1;
  const restored = await offerHook(w); await restored.open();
  await restored.current.handleSubmitCounterOffer();
  assert.equal(w.rows.filter(row => row.userId === 1).length, 1);
});

test('a queued offer callback cannot dispatch previous-account payload after a scope change', async () => {
  const w = world(), hook = await offerHook(w);
  await hook.open();
  const oldSubmit = hook.current.handleSubmitCounterOffer;
  w.env.userId = 2; hook.params.currentUserId = 2; hook.params.scopeKey = 'worker:2'; hook.render();
  await oldSubmit();
  assert.equal(w.calls.length, 0, 'previous account offer was sent using the new account');
});

test('an invalid form still reconciles the pending original offer', async () => {
  const w = world(), first = await offerHook(w);
  await first.open(); await first.current.handleSubmitCounterOffer(); first.unmount();
  const restarted = await offerHook(w);
  await restarted.open();
  restarted.current.handleCounterSlotChange(0, 'startTime', ''); restarted.render();
  await restarted.current.handleSubmitCounterOffer();
  assert.equal(w.calls.length, 2);
  assert.deepEqual(w.calls[1].payload, w.calls[0].payload);
  assert.equal(w.rows.length, 1);
});

for (const status of [400, 409, 410]) test(`another offer unblocks after ${status}`, async () => {
  const w = world(); w.env.status = status;
  const hook = await offerHook(w); await hook.open();
  await hook.current.handleSubmitCounterOffer(); hook.render();
  await hook.current.anotherCounterOffer();
  w.env.status = null; w.env.lost = false;
  await hook.open(); await hook.current.handleSubmitCounterOffer();
  assert.equal(w.rows.length, 1);
  assert.notEqual(w.calls.at(-1).key, w.calls[0].key);
});

test('user can clear a corrupt offer intent after review', async () => {
  const w = world(), hook = await offerHook(w); await hook.open();
  await hook.current.handleSubmitCounterOffer(); hook.render();
  const key = [...w.data.keys()].find(k => k.startsWith('shift.counter_offer.create:'));
  w.data.set(key, '{bad');
  await hook.current.anotherCounterOffer();
  w.env.alertButtons.find(button => button.text === 'Confirm').onPress(); await flush();
  assert.equal(w.data.has(key), false);
});
