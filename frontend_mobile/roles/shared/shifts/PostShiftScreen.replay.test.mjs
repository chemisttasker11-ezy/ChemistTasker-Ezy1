// Replay contract: optional Idempotency-Key; unique (user, operation, key) receipt;
// 409 payload mismatch includes existing shift_id; replay rechecks current authorization.
import test from 'node:test';
import assert from 'node:assert/strict';
import { world, postScreen, savedIntents, deferred, flush } from './submissionReplay.test-support.mjs';

async function recoveryWithDefaults() {
  const w = world();
  w.env.pharmacies = [{ id: 7, name: 'Replay Pharmacy', rate_weekday: '70', software: ['software'], allowed_escalation_levels: ['LOCUM_CASUAL', 'PLATFORM'] }];
  const first = await postScreen(w, { fill: true });
  first.current.setRateWeekday('50'); first.current.setNiceToHave([]);
  first.current.setEscalationDates({ platform: '2026-11-20T09:00:00+10:00' }); first.render();
  await first.current.handleSubmit(); first.unmount();
  const [key, raw] = [...w.data].find(([, value]) => JSON.parse(value)?.exactPayload);
  w.data.set(key, JSON.stringify({ ...JSON.parse(raw), resultId: w.rows[0].id, recovery: true, pendingEdit: { description: 'Saved correction' } }));
  return w;
}

test('recovery keeps posted rates after pharmacy effects', async () => {
  const w = await recoveryWithDefaults();
  assert.equal(w.calls[0].payload.rate_weekday, '50');
  const restarted = await postScreen(w, { fill: true });
  await restarted.current.handleSubmit();
  assert.equal('rate_weekday' in w.edits.at(-1).payload, false);
});

test('recovery does not replace a cleared rate with a pharmacy default', async () => {
  const w = await recoveryWithDefaults();
  const [key, raw] = [...w.data].find(([, value]) => JSON.parse(value)?.exactPayload);
  const intent = JSON.parse(raw);
  intent.exactPayload.rate_weekday = null;
  intent.pendingEdit.rate_weekday = null;
  w.data.set(key, JSON.stringify(intent));
  const restarted = await postScreen(w, { fill: true });
  await restarted.current.handleSubmit();
  assert.notEqual(w.edits.at(-1).payload.rate_weekday, '70');
});

test('recovery keeps posted software preferences after pharmacy effects', async () => {
  const w = await recoveryWithDefaults();
  const restarted = await postScreen(w, { fill: true });
  await restarted.current.handleSubmit();
  assert.equal('nice_to_have' in w.edits.at(-1).payload, false);
});

test('recovery preserves escalation dates but a later audience change clears them', async () => {
  const w = await recoveryWithDefaults();
  assert.ok(w.calls[0].payload.escalate_to_platform);
  const restarted = await postScreen(w, { fill: true });
  await restarted.current.handleSubmit();
  assert.equal('escalate_to_platform' in w.edits.at(-1).payload, false);
  const next = await recoveryWithDefaults();
  const screen = await postScreen(next, { fill: true });
  screen.current.setInitialAudience('PLATFORM'); screen.render();
  await screen.effects(); screen.render();
  await screen.current.handleSubmit();
  assert.equal(next.edits.at(-1).payload.escalate_to_platform, null);
});

test('restart after committed lost response replays one shift with exact key and slots', async () => {
  const w = world();
  const first = await postScreen(w, { fill: true });
  await first.current.handleSubmit();
  assert.equal(w.rows.length, 1, 'first request really committed');
  first.unmount();
  const restarted = await postScreen(w, { fill: true });
  await restarted.current.handleSubmit();
  assert.equal(w.rows.length, 1, 'restart created a second shift');
  assert.equal(w.calls[1].key, w.calls[0].key);
  assert.ok(w.calls[0].key);
  assert.deepEqual(w.calls[1].payload, w.calls[0].payload);
});

test('key and exact payload are durable per account BEFORE create dispatch', async () => {
  const w = world(), screen = await postScreen(w, { fill: true });
  await screen.current.handleSubmit();
  assert.equal(w.calls.length, 1);
  const intents = savedIntents(w.calls[0].stored);
  assert.equal(intents.length, 1, 'create dispatched before its intent was saved');
  assert.equal(intents[0].key, w.calls[0].key);
  assert.deepEqual(intents[0].exactPayload, w.calls[0].payload);
  screen.unmount();
  w.env.userId = 2;
  const other = await postScreen(w, { fill: true });
  await other.current.handleSubmit();
  assert.notEqual(w.calls[1].key, w.calls[0].key);
});

test('ambiguous post is recovered before edited draft uses existing shift edit path', async () => {
  const w = world(), first = await postScreen(w, { fill: true });
  await first.current.handleSubmit(); first.unmount();
  const restarted = await postScreen(w, { fill: true });
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

// intentional (orchestrator D135): an acknowledged success clears the intent
test('fresh form after an acknowledged success creates a second shift', async () => {
  const w = world(); w.env.lost = false;
  const first = await postScreen(w, { fill: true });
  await first.current.handleSubmit(); first.unmount();
  const next = await postScreen(w, { fill: true });
  next.current.setSlots([{ date: '2026-12-09', startTime: '10:00', endTime: '14:00', isRecurring: false }]);
  next.current.setDescription('A different shift next week'); next.render();
  await next.current.handleSubmit();
  assert.equal(w.rows.length, 2, 'new form silently PATCHed the previous shift');
});

test('same-render duplicate taps retain the existing synchronous lock', async () => {
  const w = world(); w.env.gate = deferred(); w.env.lost = false;
  const screen = await postScreen(w, { fill: true }), submit = screen.current.handleSubmit;
  const a = submit(), b = submit(); await flush();
  assert.equal(w.calls.length, 1);
  w.env.gate.resolve(); await Promise.all([a, b]);
});

test('explicit post-another starts a new key after recovery', async () => {
  const w = world(), first = await postScreen(w, { fill: true });
  await first.current.handleSubmit(); first.unmount();
  const screen = await postScreen(w, { fill: true });
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
  const old = await postScreen(w, { fill: true });
  const request = old.current.handleSubmit(); await flush();
  assert.equal(w.rows.length, 1);
  old.unmount(); w.env.userId = 2;
  w.env.gate.resolve(); await request;
  const other = await postScreen(w, { fill: true });
  other.current.setDescription('Other account'); other.render();
  await other.current.handleSubmit();
  assert.equal(w.calls[1].userId, 2);
  assert.notEqual(w.calls[1].key, w.calls[0].key, 'accounts shared an unscoped/missing create key');
  other.unmount(); w.env.userId = 1;
  const restored = await postScreen(w, { fill: true });
  await restored.current.handleSubmit();
  assert.equal(w.rows.filter(row => row.userId === 1).length, 1);
  assert.equal(w.calls.at(-1).key, w.calls[0].key);
});

test('a queued submit callback from the previous account cannot send under the new account', async () => {
  const w = world(), screen = await postScreen(w, { fill: true });
  const oldSubmit = screen.current.handleSubmit;
  w.env.userId = 2; screen.render();
  await oldSubmit();
  assert.equal(w.calls.length, 0, 'previous account draft was sent using the new account');
});

test('recovery saves the edits made after the lost response before success', async () => {
  const w = world(), first = await postScreen(w, { fill: true });
  await first.current.handleSubmit(); first.unmount();
  const retry = await postScreen(w, { fill: true });
  retry.current.setDescription('Changed during recovery'); retry.render();
  await retry.current.handleSubmit();
  assert.equal(w.edits.at(-1)?.payload.description, 'Changed during recovery');
});

test('failed recovered edit survives restart and patches the same shift', async () => {
  const w = world(), first = await postScreen(w, { fill: true });
  await first.current.handleSubmit(); first.unmount();
  const retry = await postScreen(w, { fill: true });
  retry.current.setDescription('Durable recovery edit'); retry.render();
  w.env.editFailure = true; await retry.current.handleSubmit(); retry.unmount();
  w.env.editFailure = false;
  const restarted = await postScreen(w, { fill: true });
  await restarted.current.handleSubmit();
  assert.equal(w.rows.length, 1);
  assert.equal(w.edits.at(-1)?.id, w.rows[0].id);
  assert.equal(w.edits.at(-1)?.payload.description, 'Durable recovery edit');
});

test('later corrections replace a failed recovered edit before retry', async () => {
  const w = world(), first = await postScreen(w, { fill: true });
  await first.current.handleSubmit(); first.unmount();
  const retry = await postScreen(w, { fill: true });
  retry.current.setDescription('First edit'); retry.render();
  w.env.editFailure = true; await retry.current.handleSubmit();
  retry.current.setDescription('Corrected edit'); retry.render();
  w.env.editFailure = false; await retry.current.handleSubmit();
  assert.equal(w.edits.at(-1)?.payload.description, 'Corrected edit');
  assert.equal(savedIntents(w.edits.at(-1).stored)[0].pendingEdit.description, 'Corrected edit');
});

test('correction after restart is persisted before recovery PATCH', async () => {
  const w = world(), first = await postScreen(w, { fill: true });
  await first.current.handleSubmit(); first.unmount();
  const retry = await postScreen(w, { fill: true });
  retry.current.setDescription('First edit'); retry.render();
  w.env.editFailure = true; await retry.current.handleSubmit(); retry.unmount();
  const restarted = await postScreen(w, { fill: true });
  restarted.current.markTouched(); restarted.current.setDescription('After restart'); restarted.render();
  w.env.editFailure = false; await restarted.current.handleSubmit();
  assert.equal(w.edits.at(-1).payload.description, 'After restart');
  assert.equal(savedIntents(w.edits.at(-1).stored)[0].pendingEdit.description, 'After restart');
});

test('post another can discard an unsaved recovered edit after confirmation', async () => {
  const w = world(), first = await postScreen(w, { fill: true });
  await first.current.handleSubmit(); first.unmount();
  const retry = await postScreen(w, { fill: true });
  retry.current.setDescription('edit'); retry.render();
  w.env.editFailure = true; await retry.current.handleSubmit(); retry.render();
  await retry.current.explicitActions.anotherPost();
  assert.ok(w.env.alertButtons?.some(button => button.text === 'Discard'));
  w.env.alertButtons.find(button => button.text === 'Discard').onPress(); await flush();
  assert.equal(savedIntents([...w.data]).length, 0);
});

for (const status of [400, 403, 404]) test(`terminal recovery PATCH ${status} releases the saved intent`, async () => {
  const w = world(), first = await postScreen(w, { fill: true });
  await first.current.handleSubmit(); first.unmount();
  const retry = await postScreen(w, { fill: true });
  retry.current.setDescription('edit'); retry.render();
  w.env.editFailure = status; await retry.current.handleSubmit(); retry.render();
  assert.equal(savedIntents([...w.data]).length, 0);
  await retry.current.explicitActions.anotherPost(); retry.render();
  assert.notEqual(retry.current.error, 'Recover the previous shift before posting another.');
});

test('retry after terminal recovery refusal does not create a duplicate shift', async () => {
  const w = world(), first = await postScreen(w, { fill: true });
  await first.current.handleSubmit(); first.unmount();
  const retry = await postScreen(w, { fill: true });
  retry.current.setDescription('edit'); retry.render();
  w.env.editFailure = true; await retry.current.handleSubmit(); retry.unmount();
  const restarted = await postScreen(w, { fill: true });
  w.env.editFailure = 403; await restarted.current.handleSubmit(); restarted.render();
  w.env.editFailure = false; await restarted.current.handleSubmit();
  assert.equal(w.rows.length, 1);
});

test('reverting a possibly committed recovery edit sends the original before clearing', async () => {
  const w = world(), first = await postScreen(w, { fill: true });
  await first.current.handleSubmit(); first.unmount();
  const retry = await postScreen(w, { fill: true });
  retry.current.setDescription('First edit'); retry.render();
  w.env.editCommitThenFail = true; w.env.editFailure = true; await retry.current.handleSubmit();
  assert.equal(w.rows[0].payload.description, 'First edit');
  retry.unmount();
  const restarted = await postScreen(w, { fill: true });
  restarted.current.markTouched(); restarted.current.setDescription('Original'); restarted.render();
  w.env.editCommitThenFail = false;
  w.env.editFailure = true; await restarted.current.handleSubmit();
  assert.equal(w.edits.at(-1).payload.description, 'Original');
  assert.equal(savedIntents([...w.data]).length, 1);
  w.env.editFailure = false; await restarted.current.handleSubmit();
  assert.equal(w.edits.at(-1).payload.description, 'Original');
  assert.equal(savedIntents([...w.data]).length, 0);
});

test('restart prefills recovery and preserves the saved description when only slots change', async () => {
  const w = world(), first = await postScreen(w, { fill: true });
  await first.current.handleSubmit(); first.unmount();
  const retry = await postScreen(w, { fill: true });
  retry.current.setDescription('Saved correction'); retry.render();
  w.env.editFailure = true; await retry.current.handleSubmit(); retry.unmount();
  const restarted = await postScreen(w, { fill: true });
  assert.equal(restarted.current.description, 'Saved correction');
  assert.equal(restarted.current.toast, 'Your last shift was posted but your changes did not save. Post saves them to that shift; Post another discards them.');
  restarted.current.markTouched();
  restarted.current.setSlots([{ date: '2026-12-02', startTime: '10:00', endTime: '18:00', isRecurring: false }]); restarted.render();
  w.env.editFailure = false; await restarted.current.handleSubmit();
  assert.equal(w.edits.at(-1).payload.description, 'Saved correction');
  assert.ok(w.edits.at(-1).payload.slots);
});

test('terminal PATCH after restart releases the stored recovery edit', async () => {
  const w = world(), first = await postScreen(w, { fill: true });
  await first.current.handleSubmit(); first.unmount();
  const retry = await postScreen(w, { fill: true });
  retry.current.setDescription('edit'); retry.render();
  w.env.editFailure = true; await retry.current.handleSubmit(); retry.unmount();
  assert.equal(savedIntents([...w.data]).length, 1);
  const restarted = await postScreen(w, { fill: true });
  w.env.editFailure = 403; await restarted.current.handleSubmit();
  assert.equal(savedIntents([...w.data]).length, 0);
});

test('a stale stored edit sent during a newer user edit does not mark the form clean', async () => {
  const w = world(), first = await postScreen(w, { fill: true });
  await first.current.handleSubmit(); first.unmount();
  const retry = await postScreen(w, { fill: true });
  retry.current.setDescription('Saved correction'); retry.render();
  w.env.editFailure = true; await retry.current.handleSubmit(); retry.unmount();
  const restarted = await postScreen(w, { fill: true });
  w.env.editFailure = false; w.env.editGate = deferred();
  const before = w.env.cleanCalls.length;
  const saving = restarted.current.handleSubmit(); await flush();
  restarted.current.markTouched(); restarted.current.setDescription('Newer correction'); restarted.render();
  w.env.editGate.resolve(); await saving;
  assert.equal(w.edits.at(-1).payload.description, 'Saved correction');
  assert.equal(w.env.cleanCalls.length, before);
});

test('terminal PATCH without pendingEdit releases recovery intent', async () => {
  const w = world(), first = await postScreen(w, { fill: true });
  await first.current.handleSubmit(); first.unmount();
  const s = await postScreen(w, { fill: true });
  s.current.setSlots([]); s.current.setDescription('x'); s.render();
  await s.current.handleSubmit(); s.render();
  assert.equal(savedIntents([...w.data]).length, 1);
  s.current.setSlots([{ date: '2026-12-02', startTime: '10:00', endTime: '18:00', isRecurring: false }]); s.render();
  w.env.editFailure = 404; await s.current.handleSubmit();
  assert.equal(w.edits.length, 1);
  assert.equal(savedIntents([...w.data]).length, 0);
});

test('description-only edit after recovery does not replace slots', async () => {
  // intentional (orchestrator D136): recovery path, not an acknowledged success
  const w = world(); const first = await postScreen(w, { fill: true });
  await first.current.handleSubmit(); first.unmount();
  const retry = await postScreen(w, { fill: true });
  retry.current.setDescription('Only description changed'); retry.render();
  await retry.current.handleSubmit();
  assert.ok(w.edits.length);
  assert.equal('slots' in w.edits.at(-1).payload, false, 'unchanged slots would be deleted and recreated');
});

test('description-only recovery keeps existing slot ids and counter-offers', async () => {
  // intentional (orchestrator D136): recovery path, not an acknowledged success
  const w = world(); const first = await postScreen(w, { fill: true });
  await first.current.handleSubmit(); first.unmount();
  w.rows[0].slotIds = [17]; w.rows[0].counterOffers = [{ id: 23, slotId: 17 }];
  const retry = await postScreen(w, { fill: true });
  retry.current.setDescription('Only the description'); retry.render();
  await retry.current.handleSubmit();
  assert.deepEqual(w.rows[0].slotIds, [17]);
  assert.deepEqual(w.rows[0].counterOffers, [{ id: 23, slotId: 17 }]);
});

for (const status of [400, 403, 404, 409, 410]) test(`post another unblocks after ${status}`, async () => {
  const w = world(); w.env.status = status;
  const screen = await postScreen(w, { fill: true });
  await screen.current.handleSubmit(); screen.render();
  await screen.current.explicitActions.anotherPost(); screen.render();
  w.env.status = null; w.env.lost = false;
  screen.current.setPharmacyId(7);
  screen.current.setSlots([{ date: '2026-12-02', startTime: '10:00', endTime: '18:00', isRecurring: false }]);
  screen.current.setDescription('Another shift'); screen.render();
  await screen.current.handleSubmit();
  assert.equal(w.rows.length, 1);
  assert.notEqual(w.calls.at(-1).key, w.calls[0].key);
});

test('invalid visible form is never sent as a recovery edit', async () => {
  const w = world(), first = await postScreen(w, { fill: true });
  await first.current.handleSubmit(); first.unmount();
  const screen = await postScreen(w, { fill: true });
  screen.current.setSlots([]); screen.current.setDescription('Invalid edit'); screen.render();
  await screen.current.handleSubmit(); screen.render();
  assert.equal(w.edits.length, 0);
  assert.match(screen.current.error, /date|slot/i);
  screen.current.setSlots([{ date: '2026-12-02', startTime: '10:00', endTime: '18:00', isRecurring: false }]); screen.render();
  await screen.current.handleSubmit();
  assert.equal(w.edits.at(-1)?.id, w.rows[0].id);
  assert.equal(w.edits.at(-1)?.payload.description, 'Invalid edit');
});

test('user can clear a corrupt post intent after review', async () => {
  const w = world(), screen = await postScreen(w, { fill: true });
  await screen.current.handleSubmit(); screen.render();
  const key = [...w.data.keys()].find(k => k.startsWith('shift.create:'));
  w.data.set(key, '{bad');
  await screen.current.explicitActions.anotherPost();
  w.env.alertButtons.find(button => button.text === 'Confirm').onPress(); await flush();
  assert.equal(w.data.has(key), false);
});

test('settled intent left by an interrupted settle does not turn a fresh form into an edit', async () => {
  const w = world(); w.env.lost = false;
  const first = await postScreen(w, { fill: true });
  await first.current.handleSubmit(); first.unmount();
  assert.equal(w.rows.length, 1);
  // Re-create the state a kill/account switch right after store.settle leaves behind.
  const stored = savedIntents(w.calls[0].stored)[0];
  const key = [...w.calls[0].stored].find(([k]) => k.startsWith('shift.create:'))[0];
  w.data.set(key, JSON.stringify({ ...stored, resultId: w.rows[0].id }));
  const next = await postScreen(w, { fill: true });
  next.current.setSlots([{ date: '2026-12-09', startTime: '10:00', endTime: '14:00', isRecurring: false }]);
  next.current.setDescription('A different shift next week'); next.render();
  await next.current.handleSubmit();
  assert.equal(w.edits.length, 0, `fresh form PATCHed shift ${w.edits[0]?.id} with ${JSON.stringify(Object.keys(w.edits[0]?.payload ?? {}))}`);
  assert.equal(w.rows.length, 2);
});
