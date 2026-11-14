// Replay contract: optional Idempotency-Key; unique (user, operation, key) receipt;
// 409 payload mismatch includes existing shift_id; replay rechecks current authorization.
// Test-only runtime: execute shipping screen/hook logic; retain AsyncStorage across remounts.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { randomUUID } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : ['2026-11-13T12:00:00+10:00'])); }
  static now() { return new Date('2026-11-13T12:00:00+10:00').getTime(); }
}
export const clone = value => JSON.parse(JSON.stringify(value));
export const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
export function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function hooks() {
  let index = 0;
  let changed = false;
  const slots = [], effects = [], cleanups = [];
  const equal = (a, b) => a && b && a.length === b.length && a.every((v, i) => v === b[i]);
  const react = {
    useState(initial) {
      const i = index++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], value => { const next = typeof value === 'function' ? value(slots[i]) : value; if (JSON.stringify(next) !== JSON.stringify(slots[i])) changed = true; slots[i] = next; }];
    },
    useRef(initial) { const i = index++; return slots[i] ??= { current: initial }; },
    useMemo(fn, deps) {
      const i = index++;
      if (!slots[i] || !equal(slots[i].deps, deps)) slots[i] = { deps, value: fn() };
      return slots[i].value;
    },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(fn, deps) {
      const i = index++;
      if (!slots[i] || !equal(slots[i].deps, deps)) {
        slots[i] = { deps };
        effects.push(() => { cleanups[i]?.(); cleanups[i] = fn(); });
      }
    },
  };
  return { react, begin: () => { index = 0; }, resetChanged: () => { changed = false; }, changed: () => changed,
    effects: async () => { while (effects.length) effects.shift()(); await flush(); },
    unmount: () => cleanups.forEach(fn => fn?.()) };
}

export function world() {
  const data = new Map(), rows = [], calls = [], edits = [], receipts = new Map();
  const env = { userId: 1, lost: true, gate: null, cleanCalls: [] };
  const storage = {
    getItem: async key => data.get(key) ?? null,
    setItem: async (key, value) => { data.set(key, value); },
    removeItem: async key => { data.delete(key); },
  };
  async function send(operation, payload, key) {
    calls.push({ operation, payload: clone(payload), key, userId: env.userId, stored: [...data.entries()] });
    if (env.status) { const error = new Error('Rejected'); error.status = env.status; error.payload = {}; throw error; }
    const scope = JSON.stringify([env.userId, operation, key]);
    let row = key && receipts.get(scope);
    if (!row) { row = { id: rows.length + 1, userId: env.userId, operation, payload: clone(payload) }; rows.push(row); }
    if (key) receipts.set(scope, row);
    if (env.gate) await env.gate.promise;
    if (env.lost) { env.lost = false; throw Error('response lost AFTER commit'); }
    return { id: row.id };
  }
  return { data, rows, calls, edits, env, storage, send };
}

function runtime(w, h) {
  const cache = new Map();
  const shared = {
    ApiError: Error,
    createOwnerShiftService: (payload, key) => w.send('shift.create', payload, key),
    updateOwnerShiftService: async (id, payload) => {
      w.edits.push({ id, payload: clone(payload), stored: [...w.data] });
      if (w.env.editGate) await w.env.editGate.promise;
      const row = w.rows.find(value => value.id === id);
      if (w.env.editCommitThenFail && row) Object.assign(row.payload, clone(payload));
      if (w.env.editFailure) { const error = Error('PATCH failed'); if (typeof w.env.editFailure === 'number') error.status = w.env.editFailure; throw error; }
      if (row) Object.assign(row.payload, clone(payload));
      if (row?.slotIds && 'slots' in payload) { row.slotIds = [999]; row.counterOffers = []; }
      return { id };
    },
    fetchPharmaciesService: async () => w.env.pharmacies || [], listShiftDescriptionTemplates: async () => [],
    calculateShiftRates: async () => [], fetchShiftCounterOffersService: async () => [],
    getPharmacyHoursForDate: () => ({ startTime: '09:00', endTime: '17:00' }),
    normalizeWorkloadTags: (_registry, value) => value || [], pharmacySoftwareDefaults: (_registry, _role, software) => software,
    mergeSoftwareDefaults: (value, _must, previous, next) => [...value.filter(item => !previous.includes(item)), ...next.filter(item => !value.includes(item))],
    normalizeShiftRequirements: (_registry, value) => value || [],
    canNotifyShiftChainMembers: () => false, isPrivateShiftBooking: () => false,
    automaticShiftEscalationDates: () => ({}),
  };
  function load(file, screen = false) {
    if (cache.has(file)) return cache.get(file);
    let source = readFileSync(file, 'utf8');
    if (screen) {
      const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'PostShiftScreen');
      const actions = component.body.statements.flatMap(node => ts.isVariableStatement(node)
        ? node.declarationList.declarations.map(d => d.name.getText(ast)).filter(name => /another/i.test(name)) : []);
      // Replace JSX-only tail with a probe. All state, effects and save callbacks run unchanged.
      source = source.slice(0, source.indexOf('    const chipStyle =')) + `
        return { handleSubmit, dismissToast, setDescription, setSlots, setPharmacyId, markTouched, description,
          setPharmacies, setPharmaciesLoaded, initialSlotsJsonRef, setInitialAudience, setEscalationDates, setRateWeekday, setNiceToHave, error, toast,
          explicitActions: { ${actions.join(',')} } };
      }`;
    }
    const exports = {};
    cache.set(file, exports);
    const js = ts.transpileModule(source, { fileName: file, compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true,
    } }).outputText;
    vm.runInNewContext(js, { exports, console, Date: FixedDate, JSON, Promise, Error, Set, Map, URL, URLSearchParams,
      AbortController, __DEV__: false, setTimeout, clearTimeout, require(name) {
        if (file.endsWith('pendingPitch.ts') && name === './api') return {};
        if (name === 'react') return { ...h.react, default: h.react };
        if (name === '@chemisttasker/shared-core') return shared;
        if (name === '@react-native-async-storage/async-storage') return { __esModule: true, default: w.storage };
        if (name === '@/features/parity/utils') return { idempotencyKey: randomUUID };
        if (name === '@/context/AuthContext') return { useAuth: () => ({ user: { id: w.env.userId }, hasCapability: () => true }) };
        if (name === 'expo-router') return { useRouter: () => ({ replace(route) { w.env.route = route; } }), useLocalSearchParams: () => ({}), useFocusEffect() {} };
        if (name === 'react-native') return { Platform: { OS: 'ios' }, Alert: { alert(_title, _message, buttons) { w.env.alertButtons = buttons; } } };
        if (name === './useShiftSurface') return { useShiftSurface: () => ({ scopeKey: `owner:${w.env.userId}`, userId: w.env.userId, persona: 'owner', scopedPharmacyId: 7 }) };
        if (name === './shiftSurface') return { shiftRoute: () => '/shifts' };
        if (name.includes('useUnsavedChangesGuard')) return { useUnsavedChangesGuard: () => ({ markClean(...args) { w.env.cleanCalls.push(args); } }) };
        if (name.endsWith('PostShiftScreen.styles')) return { styles: {} };
        if (name.endsWith('/utils/counterOffers')) return { normalizeCounterOffers: value => value };
        if (name.endsWith('/utils/date')) return { formatDateLong: value => value };
        if (name.endsWith('/utils/location')) return { formatTravelLocation: () => '', normalizeOnboardingLocation: () => ({}) };
        if (name.endsWith('/utils/rates')) return { getSlotRate: () => 70 };
        if (name.endsWith('/utils/shift')) return { getUpcomingSlotsForDisplay: value => value, getShiftNegotiable: () => true };
        if (name.endsWith('/constants')) return { EMPTY_TRAVEL_LOCATION: {}, COUNTER_OFFER_STORAGE_KEY: 'badges', shiftStorageKey: (key, scope) => `${key}:${scope}` };
        if (name.startsWith('.')) {
          const target = resolve(dirname(file), name + '.ts');
          if (existsSync(target)) return load(target);
        }
        if (name.startsWith('@/') || name.includes('skills_registry') || name.includes('PostShift') || name.includes('NativeShiftBoardPreview') || name.startsWith('react-native')) return {};
        throw Error('Unmocked replay boundary: ' + name);
      } }, { filename: file });
    return exports;
  }
  Object.assign(shared, load(resolve(here, '../../../../shared-core/src/domains/talent/pendingPitch.ts')));
  Object.assign(shared, load(resolve(here, '../../../../shared-core/src/domains/shifts/postingWindow.ts')));
  Object.assign(shared, load(resolve(here, '../../../../shared-core/src/domains/shifts/postingDraft.ts')));
  shared.expandShiftDraftSlots = slots => slots;
  shared.reconcileShiftDraftRateRows = (_slots, rows) => rows || [];
  return { load, shared };
}

export async function postScreen(w, { fill = false } = {}) {
  const h = hooks(), r = runtime(w, h);
  const Component = r.load(resolve(here, 'PostShiftScreen.tsx'), true).default;
  let current;
  const render = () => { h.begin(); current = Component(); return current; };
  render();
  // Supply a loaded pharmacy/form through actual setters; isolate network initialization.
  current.setPharmacies(w.env.pharmacies || [{ id: 7, name: 'Replay Pharmacy', allowed_escalation_levels: ['LOCUM_CASUAL'] }]);
  current.setPharmaciesLoaded(true);
  if (fill && !savedIntents([...w.data]).some(intent => intent.recovery && intent.resultId)) {
    current.setPharmacyId(7);
    current.setInitialAudience('LOCUM_CASUAL');
    current.setSlots([{ date: '2026-12-01', startTime: '09:00', endTime: '17:00', isRecurring: false }]);
    current.setDescription('Original');
  }
  render();
  // Effects for durable intents still run; the screen's real initialization can finish first.
  await h.effects();
  current.setPharmaciesLoaded(true);
  if (fill && !savedIntents([...w.data]).some(intent => intent.recovery && intent.resultId)) {
    current.setPharmacyId(7);
    current.setSlots([{ date: '2026-12-01', startTime: '09:00', endTime: '17:00', isRecurring: false }]);
    current.setDescription('Original'); current.setInitialAudience('LOCUM_CASUAL');
  }
  render();
  for (let i = 0; ; i++) {
    if (i === 50) throw Error('PostShiftScreen effects did not stabilize');
    h.resetChanged(); await h.effects();
    if (!h.changed()) break;
    render();
  }
  return { render, unmount: h.unmount, effects: h.effects, get current() { return current; } };
}

export function boardHandler(w, file, verified = true) {
  const source = readFileSync(resolve(here, file), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let initializer;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'handleSubmitCounterOffer') initializer = node.initializer.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  const js = ts.transpileModule(`exports.handler = ${initializer}`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const box = { exports: {}, console, Error, guardVerified: () => verified, errorMessage: e => e.message,
    submitShiftCounterOfferService: (payload, key) => w.send('shift.counter_offer.create', payload, key) };
  vm.runInNewContext(js, box);
  return box.exports.handler;
}

export async function offerHook(w, userId = w.env.userId, handler) {
  const h = hooks(), r = runtime(w, h);
  const useCounterOffers = r.load(resolve(here, 'ShiftsBoard/hooks/useCounterOffers.ts')).useCounterOffers;
  const params = { shifts: [], scopeKey: `worker:${userId}`, currentUserId: userId,
    clearSelection() {}, setAppliedShiftIds() {}, setAppliedSlotIds() {}, refreshShifts: async () => {},
    onSubmitCounterOffer: handler ?? ((payload, key) => w.send('shift.counter_offer.create', payload, key)) };
  let current;
  const render = () => { h.begin(); current = useCounterOffers(params); return current; };
  render(); await h.effects(); render();
  const open = async (id = 42, slotId = 17) => {
    await current.openCounterOffer({ id, slots: [{ id: slotId, date: '2026-12-01', startTime: '09:00', endTime: '17:00' }] });
    return render();
  };
  return { render, open, params, unmount: h.unmount, get current() { return current; } };
}

export function savedIntents(entries) {
  return entries.map(([, raw]) => JSON.parse(raw)).filter(value => value?.key && value?.exactPayload);
}
