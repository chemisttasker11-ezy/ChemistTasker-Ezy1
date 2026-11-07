// M4-08: execute the real calendar hook and Vite/admin wrappers, not source-text checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import dayjs from 'dayjs';

function execute(file, imports) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const transpiled = ts.transpileModule(source, { fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(transpiled, {
    module, exports: module.exports, console, URLSearchParams, Date, Map, Set,
    require(name) {
      if (!Object.prototype.hasOwnProperty.call(imports, name)) throw new Error('Unmocked import: ' + name + ' in ' + file);
      const value = imports[name];
      return value && typeof value === 'object' && 'default' in value && !value.__esModule
        ? { __esModule: true, ...value } : value;
    },
  }, { filename: file });
  return module.exports;
}
const slotDomain = execute('../../../shared-core/src/domains/shifts/draftSlots.ts', {});
const posting = execute('../../../shared-core/src/domains/shifts/postingDraft.ts', {
  './draftSlots': slotDomain, './visibility': { isPrivateShiftBooking: () => false },
  './mappers': { mapShift: value => value },
});
const core = { expandShiftDraftSlots: slotDomain.expandShiftDraftSlots,
  isValidShiftPostingTimeRange: posting.isValidShiftPostingTimeRange,
  ORG_ROLES: [], getPharmacyHoursForDate: (_pharmacy, _date, fallback) =>
    ({ ...fallback, closed: false, label: '', isPublicHoliday: false, holidayNeedsReview: false,
      holidayStatus: '', partDayWindows: [] }) };
const helpers = execute('./helpers.ts', {
  dayjs, moment: { default: () => ({}) },
  'react-big-calendar': { momentLocalizer: () => null },
  '@chemisttasker/shared-core': core,
});
function harness() {
  const values = [];
  let index = 0;
  const react = {
    useState(initial) {
      const slot = index++;
      if (!(slot in values)) values[slot] = typeof initial === 'function' ? initial() : initial;
      return [values[slot], next => {
        values[slot] = typeof next === 'function' ? next(values[slot]) : next;
      }];
    },
    useMemo(fn) { index++; return fn(); },
    useCallback(fn) { index++; return fn; },
    useEffect() { index++; },
  };
  const hooks = execute('./useShiftTimetable.ts', {
    react: { __esModule: true, default: react, ...react }, dayjs,
    '@chemisttasker/shared-core': core, './helpers': helpers,
  });
  return {
    render(options = {}) {
      index = 0;
      return hooks.useShiftTimetable({ selectedPharmacy: undefined, editingShiftId: null,
        showSnackbar: () => {}, ...options });
    },
  };
}
function slot(date, startTime = '22:00', endTime = '06:00', extra = {}) {
  return { date, startTime, endTime, isRecurring: false, recurringDays: [],
    recurringEndDate: '', ...extra };
}
function local(event) {
  const date = value => [
    value.getFullYear(), String(value.getMonth()+1).padStart(2,'0'),
    String(value.getDate()).padStart(2,'0')].join('-');
  const clock = value => [String(value.getHours()).padStart(2,'0'),
    String(value.getMinutes()).padStart(2,'0')].join(':');
  return { start: date(event.start) + 'T' + clock(event.start),
    end: date(event.end) + 'T' + clock(event.end) };
}
function inTimezone(zone, action) {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try { action(); } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}
test('R: real hook projects overnight 22:00–06:00 into next calendar day, keeps 09:00–17:00', () =>
  inTimezone('Australia/Brisbane', () => {
    const host = harness();
    host.render().setSlots([slot('2026-07-10'), slot('2026-07-10', '09:00', '17:00')]);
    const state = host.render();
    assert.equal(state.calendarEvents.length, 2);
    assert.deepEqual(local(state.calendarEvents[0]), { start:'2026-07-10T09:00', end:'2026-07-10T17:00' });
    assert.deepEqual(local(state.calendarEvents[1]), { start:'2026-07-10T22:00', end:'2026-07-11T06:00' });
    for (const event of state.calendarEvents) assert.ok(event.end.getTime() > event.start.getTime());
    assert.deepEqual([...state.slots.map(s=>[s.date,s.startTime,s.endTime])],
      [['2026-07-10','22:00','06:00'],['2026-07-10','09:00','17:00']]);
    assert.deepEqual(slotDomain.buildShiftDraftSlotPayload(state.slots, state.expandedSlots,
      state.expandedSlots.map(() => ({ rate: 67 }))).map(x=>[x.date,x.start_time,x.end_time]),
      [['2026-07-10','22:00','06:00'],['2026-07-10','09:00','17:00']]);
  }));
test('R: recurrence projects each individual overnight event and editing retains source identity', () =>
  inTimezone('Australia/Brisbane', () => {
    const host = harness();
    host.render().setSlots([
      slot('2026-07-10', '22:00', '06:00', { isRecurring:true, recurringDays:[5,6],
        recurringEndDate:'2026-07-11' }),
      slot('2026-07-12', '09:00', '17:00'),
    ]);
    const state = host.render();
    assert.equal(state.calendarEvents.length, 3);
    assert.deepEqual(state.calendarEvents.map(x => local(x).end),
      ['2026-07-11T06:00', '2026-07-12T06:00', '2026-07-12T17:00']);
    assert.deepEqual(state.calendarEvents.map(x=>x.resource),
      [{slotIndex:0,occurrenceIndex:0},{slotIndex:0,occurrenceIndex:1},
       {slotIndex:1,occurrenceIndex:0}]);
    assert.equal(new Set(state.calendarEvents.map(x=>x.id)).size,3);
    state.handleEditSlot(1);
    const edited = host.render();
    assert.equal(edited.slots.length,1);
    assert.equal(edited.slotDate,'2026-07-12');
    assert.equal(edited.slotStartTime,'09:00');
    assert.equal(edited.slotEndTime,'17:00');
  }));
test('C: invalid values, equal clocks, year/month/leap rollovers and DST remain safe', () => {
  assert.equal(posting.isValidShiftPostingTimeRange('22:00','22:00'),false);
  assert.equal(posting.isValidShiftPostingTimeRange('22:00','06:00'),true);
  for (const [zone, date, expected] of [
    ['Australia/Brisbane','2026-12-31','2027-01-01T06:00'],
    ['Australia/Brisbane','2028-02-29','2028-03-01T06:00'],
    ['Australia/Sydney','2026-10-03','2026-10-04T06:00'],
    ['Australia/Sydney','2026-04-04','2026-04-05T06:00'],
  ]) inTimezone(zone,()=>{
    const host=harness();host.render().setSlots([slot(date)]);
    assert.equal(local(host.render().calendarEvents[0]).end,expected);
  });
  const host=harness();
  host.render().setSlots([slot('not-a-date'),slot('2026-07-10','bogus','06:00'),
    slot('2026-07-10','09:00','09:00')]);
  assert.equal(host.render().calendarEvents.length,0,
    'invalid posted drafts may not crash toISOString or show misleading calendar events');
});
test('C: actual Vite owner/admin entry wrappers preserve the same shared PostShiftForm contract', () => {
  const jsx = (type, props) => ({ type, props });
  const hostImports = {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-router-dom': { useNavigate:()=>() => {}, useLocation:()=>({search:'?date=2026-07-10'}) },
    '../../../contexts/AuthContext': { useAuth:()=>({user:{id:22,role:'OWNER'},activePersona:'owner'}) },
    '../../../theme/sleekTheme': { useColorMode:()=>({mode:'light'}) },
    '../../../utils/apiClient': { default: {} },
    '../../../components/ui/PageHeader': { default:'PageHeader' },
    '../../../../shared/postShift/PostShiftForm': { default:'RealSharedPostShiftForm' },
    './ShiftsBoard/components/ShiftBoardPreview': { default:'ShiftBoardPreview' },
  };
  const owner=execute('../../src/pages/dashboard/sidebar/PostShiftPage.tsx',hostImports);
  const admin=execute('../../src/pages/dashboard/admin/AdminPostShiftPage.tsx',{
    'react/jsx-runtime':{jsx,jsxs:jsx},
    '../../../contexts/AdminScopeContext':{useAdminScope:()=>({})},
    '../sidebar/PostShiftPage':owner,
  });
  const ownerElement=owner.default({});
  assert.equal(ownerElement.type,'RealSharedPostShiftForm');
  assert.equal(ownerElement.props.search,'?date=2026-07-10');
  const adminElement=admin.default();
  assert.equal(adminElement.type,owner.default);
  assert.equal(adminElement.type(adminElement.props).type,'RealSharedPostShiftForm');
});
