// Mounted board hook contract for counter-offer submission.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../node_modules/typescript');
const source = path.resolve(__dirname, '../roles/shared/shifts/ShiftsBoard/hooks/useCounterOffers.ts');

function harness() {
  const calls = [], states = [], refs = [];
  const values = new Map();
  const storage = { getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); }, removeItem: async key => { values.delete(key); } };
  const sharedPath = path.resolve(__dirname, '../../shared-core/src/domains/talent/pendingPitch.ts');
  const shared = { exports: {} };
  const sharedCode = ts.transpileModule(fs.readFileSync(sharedPath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(sharedCode, { module: shared, exports: shared.exports, require: () => ({}) });
  let queue = Promise.resolve();
  const lock = async (_name, run) => {
    const previous = queue; let release;
    queue = new Promise(resolve => { release = resolve; });
    await previous;
    try { return await run(); } finally { release(); }
  };
  const store = (environment, userId, operation) => shared.exports.createPendingIntentStore({ storage, lock, environment, userId,
    operation, newKey: () => require('node:crypto').randomUUID() });
  const flush = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };
  let index = 0, current;
  const react = {
    useState(initial) {
      const i = index++;
      if (!(i in states)) states[i] = initial;
      return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }];
    },
    useRef(initial) { const i = index++; return refs[i] ||= { current: initial }; },
    useMemo: fn => fn(), useEffect: () => {},
  };
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(source, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, console, __DEV__: false, require(name) {
    if (name === 'react') return react;
    if (name === '../../../talent-board/pendingPitch') return { mobilePendingIntentStore: store };
    if (name === '@react-native-async-storage/async-storage') return { setItem: async () => {} };
    if (name === 'date-fns') return require('date-fns');
    if (name === '@chemisttasker/shared-core') return {};
    if (name === '../constants') return { EMPTY_TRAVEL_LOCATION: {}, shiftStorageKey: () => 'key' };
    if (name === '../utils/counterOffers') return {};
    if (name === '../utils/date') return { formatDateLong: date => date };
    if (name === '../utils/location') return {};
    if (name === '../utils/rates') return { getSlotRate: () => 50 };
    if (name === '../utils/shift') return { getUpcomingSlotsForDisplay: slots => slots, getShiftNegotiable: () => true };
    throw Error('Unexpected board hook dependency ' + name);
  } }, { filename: source });
  const params = {
    shifts: [], scopeKey: 'worker:1', currentUserId: 1,
    clearSelection() {}, setAppliedShiftIds() {}, setAppliedSlotIds() {}, refreshShifts: async () => {},
    onSubmitCounterOffer: payload => new Promise((resolve, reject) => calls.push({ payload, resolve, reject })),
  };
  function render() { index = 0; current = module.exports.useCounterOffers(params); return current; }
  async function open(id, date) {
    await current.openCounterOffer({ id, slots: [{ id: id * 10, date, startTime: '09:00', endTime: '17:00' }] });
    return render();
  }
  render();
  return { calls, open, render, flush };
}

test('R same-render taps send one counter offer', async () => {
  const h = harness(), board = await h.open(12);
  const first = board.handleSubmitCounterOffer(), second = board.handleSubmitCounterOffer();
  await h.flush();
  assert.equal(h.calls.length, 1, 'same-render taps must send one request');
  h.calls[0].resolve();
  await Promise.all([first, second]);
});

test('C failure releases the lock for a retry', async () => {
  const h = harness(), board = await h.open(12);
  const first = board.handleSubmitCounterOffer();
  await h.flush();
  h.calls[0].reject(new Error('offline'));
  await first;
  const retry = h.render().handleSubmitCounterOffer();
  await h.flush();
  assert.equal(h.calls.length, 2);
  h.calls[1].resolve();
  await retry;
});

test('C different shifts can submit independently', async () => {
  const h = harness(), firstBoard = await h.open(12);
  const first = firstBoard.handleSubmitCounterOffer();
  const secondBoard = await h.open(13);
  const second = secondBoard.handleSubmitCounterOffer();
  await h.flush();
  assert.equal(h.calls.length, 2);
  assert.deepEqual(h.calls.map(call => call.payload.shiftId), [12, 13]);
  h.calls[0].resolve(); h.calls[1].resolve();
  await Promise.all([first, second]);
});


test('counter offer preserves date-only values west of UTC', async () => {
  process.env.TZ = 'America/Los_Angeles';
  const h = harness(), board = await h.open(12, '2026-11-11');
  const pending = board.handleSubmitCounterOffer();
  await h.flush();
  assert.equal(h.calls[0].payload.slots[0].slotDate, '2026-11-11');
  h.calls[0].resolve(); await pending;
});

