// M4-08: execute the real calendar hook and Vite/admin wrappers, not source-text checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
// Set the test zone before importing dayjs or any production date modules.
process.env.TZ ||= 'Australia/Brisbane';
const { default: dayjs } = await import('dayjs');

function execute(file, imports) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const transpiled = ts.transpileModule(source, { fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(transpiled, {
    module, exports: module.exports, console, URLSearchParams, Date, Map, Set,
    setTimeout, clearTimeout,
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
    assert.deepEqual(Array.from(slotDomain.buildShiftDraftSlotPayload(state.slots, state.expandedSlots,
      state.expandedSlots.map(() => ({ rate: 67 }))), x=>[x.date,x.start_time,x.end_time]),
      [['2026-07-10','22:00','06:00'],['2026-07-10','09:00','17:00']]);
  }));
// Mount the production timetable step, including the real Calendar.onSelectEvent
// and rendered edit/add controls. The hook and domain expansion are never mocked.
const calendarStep = (() => {
  const mui = Object.fromEntries(
    'Alert Box Button Checkbox Chip FormControlLabel Grid IconButton Paper Stack Switch TextField Tooltip Typography'
      .split(' ').map(name => [name, name]));
  const icon = name => ({ __esModule: true, default: name });
  return execute('./PostShiftTimetableStep.tsx', {
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props: props || {} }),
      jsxs: (type, props) => ({ type, props: props || {} }), Fragment: 'Fragment' },
    '@mui/material': mui,
    '@mui/icons-material/Add': icon('AddIcon'),
    '@mui/icons-material/Edit': icon('EditIcon'),
    '@mui/icons-material/Delete': icon('DeleteIcon'),
    '@mui/icons-material/Block': icon('BlockIcon'),
    'react-big-calendar': { Calendar: 'Calendar' },
    'react-big-calendar/lib/css/react-big-calendar.css': {},
    '@mui/x-date-pickers/LocalizationProvider': { LocalizationProvider: 'LocalizationProvider' },
    '@mui/x-date-pickers/AdapterDayjs': { AdapterDayjs: 'AdapterDayjs' },
    '@mui/x-date-pickers/DatePicker': { DatePicker: 'DatePicker' },
    dayjs, './helpers': helpers,
  }).default;
})();
function uiTreeNodes(node, predicate, out = []) {
  if (Array.isArray(node)) { node.forEach(x => uiTreeNodes(x, predicate, out)); return out; }
  if (!node || typeof node !== 'object') return out;
  if (predicate(node)) out.push(node);
  uiTreeNodes(node.props?.children, predicate, out);
  return out;
}
function drawCalendar(host) {
  return calendarStep({
    ...host.render(), isDarkMode: false, isEmbedded: false,
    flexibleTiming: false, setFlexibleTiming() {},
    singleUserOnly: false, setSingleUserOnly() {},
    error: '', showError() {},
  });
}
function clickCalendarEdit(host, index) {
  const controls = uiTreeNodes(drawCalendar(host),
    node => node.type === 'IconButton' && node.props['aria-label'] === 'Edit date');
  assert.ok(controls[index], 'real Edit date control for source slot ' + index);
  controls[index].props.onClick();
}
function clickCalendarSave(host) {
  const save = uiTreeNodes(drawCalendar(host), node =>
    node.type === 'Button' && node.props.children === 'Add date')[0];
  assert.ok(save, 'real Add date control must save the selected source');
  assert.equal(save.props.onClick(), true, 'future selected date must be accepted for saving');
}

test('R: recurrence projects each overnight occurrence; calendar selection edits and saves its source without losing daytime', () =>
  inTimezone('Australia/Brisbane', () => {
    const host = harness();
    host.render().setSlots([
      slot('2027-01-08', '22:00', '06:00', { isRecurring:true, recurringDays:[5,6],
        recurringEndDate:'2027-01-09' }),
      slot('2027-01-10', '09:00', '17:00'),
    ]);
    const state = host.render();
    assert.equal(state.calendarEvents.length, 3);
    assert.deepEqual(Array.from(state.calendarEvents, event => local(event).end),
      ['2027-01-09T06:00', '2027-01-10T06:00', '2027-01-10T17:00']);
    assert.deepEqual(Array.from(state.calendarEvents, event => ({...event.resource})),
      [{slotIndex:0,occurrenceIndex:0},{slotIndex:0,occurrenceIndex:1},
       {slotIndex:1,occurrenceIndex:0}]);
    assert.equal(new Set(state.calendarEvents.map(event => event.id)).size, 3);
    const tree = drawCalendar(host);
    const calendar = uiTreeNodes(tree, node => node.type === 'Calendar')[0];
    assert.ok(calendar, 'the actual calendar must render its public selection callback');
    const chosen = calendar.props.events[1];
    assert.deepEqual({...chosen.resource}, {slotIndex:0,occurrenceIndex:1});
    calendar.props.onSelectEvent(chosen);
    const selected = host.render();
    assert.equal(selected.slotDate, '2027-01-08');
    assert.equal(selected.slotStartTime, '22:00');
    assert.equal(selected.slotEndTime, '06:00');
    assert.equal(selected.isRecurring, true);
    assert.deepEqual(Array.from(selected.recurringDays), [5,6]);
    assert.equal(selected.recurringEndDate, '2027-01-09');
    assert.equal(selected.slots.length, 2, 'selection must not discard the recurring source');

    clickCalendarEdit(host, chosen.resource.slotIndex);
    const edited = host.render();
    assert.equal(edited.slots.length, 1);
    assert.equal(edited.slotDate, '2027-01-08');
    assert.equal(edited.slotStartTime, '22:00');
    assert.equal(edited.slotEndTime, '06:00');
    assert.deepEqual(Array.from(edited.slots, x=>[x.date,x.startTime,x.endTime]),
      [['2027-01-10','09:00','17:00']], 'other source slot is untouched');
    assert.equal(edited.isRecurring, true);
    assert.deepEqual(Array.from(edited.recurringDays), [5, 6]);
    assert.equal(edited.recurringEndDate, '2027-01-09');
    clickCalendarSave(host);
    let saved = host.render();
    assert.equal(saved.slots.length, 2);
    assert.deepEqual(Array.from(saved.expandedSlots, x=>[x.date,x.startTime,x.endTime]),
      [['2027-01-10','09:00','17:00'],['2027-01-08','22:00','06:00'],
       ['2027-01-09','22:00','06:00']], 'both recurring dates and the untouched daytime entry survive save');
    const payload = slotDomain.buildShiftDraftSlotPayload(saved.slots, saved.expandedSlots,
      saved.expandedSlots.map(() => ({rate:67})));
    assert.deepEqual(Array.from(payload, x=>[x.date,x.start_time,x.end_time,x.is_recurring,x.recurring_end_date]),
      [['2027-01-10','09:00','17:00',false,null],
       ['2027-01-08','22:00','06:00',true,'2027-01-09']],
      'posting payload stores original wall clocks and recurrence, not shifted preview end dates');

    // Restore the earlier explicit daytime-slot Edit date coverage, but
    // exercise the production control rather than calling handleEditSlot directly.
    const secondCalendar = uiTreeNodes(drawCalendar(host), node => node.type === 'Calendar')[0];
    const daytimeEvent = secondCalendar.props.events.find(e=>e.resource.slotIndex === 0);
    assert.ok(daytimeEvent);
    secondCalendar.props.onSelectEvent(daytimeEvent);
    const daytimeSelected = host.render();
    assert.equal(daytimeSelected.slotDate, '2027-01-10');
    assert.equal(daytimeSelected.slotStartTime, '09:00');
    assert.equal(daytimeSelected.slotEndTime, '17:00');
    clickCalendarEdit(host, daytimeEvent.resource.slotIndex);
    const daytimeEdited = host.render();
    assert.equal(daytimeEdited.slots.length, 1);
    assert.equal(daytimeEdited.slotDate, '2027-01-10');
    assert.equal(daytimeEdited.slotStartTime, '09:00');
    assert.equal(daytimeEdited.slotEndTime, '17:00');
    assert.deepEqual(Array.from(daytimeEdited.slots, x=>[x.date,x.startTime,x.endTime]),
      [['2027-01-08','22:00','06:00']], 'editing daytime does not remove the recurring source');
    clickCalendarSave(host);
    saved = host.render();
    assert.deepEqual(Array.from(saved.expandedSlots, x=>[x.date,x.startTime,x.endTime]),
      [['2027-01-08','22:00','06:00'],['2027-01-09','22:00','06:00'],
       ['2027-01-10','09:00','17:00']], 'both saved sources remain in the final calendar');
  }));
test('C: posting validator rejects equal times and invalid clock/date entries do not crash the calendar', () => {
  assert.equal(posting.isValidShiftPostingTimeRange('22:00','22:00'), false);
  assert.equal(posting.isValidShiftPostingTimeRange('22:00','06:00'), true);
  const host = harness();
  host.render().setSlots([slot('not-a-date'), slot('2026-07-10','bogus','06:00'),
    slot('2026-07-10','09:00','09:00')]);
  assert.equal(host.render().calendarEvents.length, 0);
});

test('R: calendar day rollover across December and leap dates', () =>
  inTimezone('Australia/Brisbane', () => {
    for (const [date, expected] of [
      ['2026-12-31','2027-01-01T06:00'],
      ['2028-02-29','2028-03-01T06:00'],
    ]) {
      const host = harness(); host.render().setSlots([slot(date)]);
      assert.equal(local(host.render().calendarEvents[0]).end, expected);
    }
  }));

test('R: DST spring-forward and fall-back preserve next calendar day 06:00, not a fixed duration', () =>
  inTimezone('Australia/Sydney', () => {
    for (const [date, expected] of [
      ['2026-10-03','2026-10-04T06:00'],
      ['2026-04-04','2026-04-05T06:00'],
    ]) {
      const host = harness(); host.render().setSlots([slot(date)]);
      assert.equal(local(host.render().calendarEvents[0]).end, expected);
    }
  }));
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


function realPostShiftHost(persona) {
  const fibers = new Map(), effects = [], submitted = [], completed = [];
  let active = null, cursor = 0, search = '?context=initial';
  let callback = () => completed.push('original');
  const same = (a,b) => a && b && a.length === b.length && a.every((x,i) => x === b[i]);
  const react = {
    useState(initial) {
      const id = cursor++, fields = active.fields;
      if (!(id in fields)) fields[id] = { value: typeof initial === 'function' ? initial() : initial };
      return [fields[id].value, update => {
        fields[id].value = typeof update === 'function' ? update(fields[id].value) : update;
      }];
    },
    useRef(initial) {
      const id = cursor++, fields = active.fields;
      if (!(id in fields)) fields[id] = { current: initial };
      return fields[id];
    },
    useMemo(fn, deps) {
      const id = cursor++, fields = active.fields;
      if (!(id in fields) || !same(fields[id].deps, deps)) fields[id] = { value: fn(), deps };
      return fields[id].value;
    },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(effect, deps) {
      const id = cursor++, fiber = active, prev = fiber.effects.get(id);
      if (!prev || !same(prev.deps, deps)) effects.push(() => {
        prev?.cleanup?.();
        fiber.effects.set(id, { deps, cleanup: effect() });
      });
    },
  };
  react.default = react;
  const jsx = (type, props) => ({ type, props: props || {} });
  const fullReact = { __esModule: true, default: react, ...react };
  const timetable = execute('./useShiftTimetable.ts', {
    react: fullReact, dayjs, './helpers': helpers,
    '@chemisttasker/shared-core': core,
  });
  const pricing = ({ expandedSlots }) => {
    const defaults = {
      rateType: 'FLEXIBLE', paymentPreference: 'ABN', rateWeekday: '',
      rateSaturday: '', rateSunday: '', ratePublicHoliday: '',
      rateEarlyMorning: '', rateLateNight: '', ownerBonus: '',
      ftptPayMode: 'HOURLY', minHourly: '', maxHourly: '',
      minAnnual: '', maxAnnual: '', superPercent: '',
      locumSuperIncluded: true, savingPharmacyRates: false,
      slotRateRows: expandedSlots.map(() => ({ rate: '67.00', status: 'idle' })),
    };
    for (const key of Object.keys(defaults)) if (!key.startsWith('set')) {
      defaults['set' + key[0].toUpperCase() + key.slice(1)] = () => {};
    }
    return { ...defaults, handleSlotRateChange() {}, handleSavePharmacyRateDefaults() {} };
  };
  const display = name => ({ __esModule: true, default: name });
  const uiComponents = Object.fromEntries('Container Alert Paper Snackbar Stack Typography'.split(' ').map(n => [n,n]));
  const shared = {
    ...core, ...posting,
    buildShiftPostingPayload: posting.buildShiftPostingPayload,
    buildShiftPostingPreview: posting.buildShiftPostingPreview,
    haveShiftPostingSlotRatesChanged: posting.haveShiftPostingSlotRatesChanged,
    getShiftPostingOwnerAdjustedRate: posting.getShiftPostingOwnerAdjustedRate,
    normalizeWorkloadTags: (_registry, items) => items,
    normalizeShiftRequirements: (_registry, items) => items,
    pharmacySoftwareDefaults: () => [], mergeSoftwareDefaults: current => current,
    canNotifyShiftChainMembers: () => false, isPrivateShiftBooking: () => false,
    automaticShiftEscalationDates: () => ({}),
    fetchPharmaciesService: async () => [{ id: 4, name: 'Site A', software: [], hasChain: false, claimed: false }],
    createOwnerShiftService: async payload => { submitted.push(payload); return { id: 900 }; },
    updateOwnerShiftService: async (_id, payload) => { submitted.push(payload); return { id: 900 }; },
  };
  const form = execute('./PostShiftForm.tsx', {
    './useShiftDescriptionTemplate': { useShiftDescriptionTemplate: () => ({
      descriptionTemplate: null, descriptionTemplateLoading: false,
      descriptionTemplateSaving: false, handleUseDescriptionTemplate() {},
      handleSaveDescriptionTemplate() {},
    }) },
    './useShiftPricing': { useShiftPricing: pricing },
    './useShiftTimetable': timetable,
    '@chemisttasker/shared-core': shared,
    '@chemisttasker/shared-core/skills_registry.json': { __esModule:true, default: {} },
    react: fullReact, 'react/jsx-runtime': { jsx, jsxs:jsx, Fragment:'Fragment' },
    '@mui/material': { ...uiComponents, useTheme: () => ({ breakpoints: { down: () => 'sm' } }),
      useMediaQuery: () => false },
    'lucide-react': new Proxy({}, { get: (_o,n) => String(n) }),
    dayjs,
    './PostShiftWizardShell': display('PostShiftWizardShell'),
    './PostShiftDetailsStep': display('PostShiftDetailsStep'),
    './PostShiftSkillsStep': display('PostShiftSkillsStep'),
    './PostShiftVisibilityStep': display('PostShiftVisibilityStep'),
    './PostShiftPayStep': display('PostShiftPayStep'),
    './PostShiftTimetableStep': display('PostShiftTimetableStep'),
    './helpers': helpers,
  });
  const auth = { user: { id: 22, role: persona === 'admin' ? 'ADMIN' : 'OWNER' },
    activePersona: persona, activeAdminPharmacyId: persona === 'admin' ? 4 : null };
  const owner = execute('../../src/pages/dashboard/sidebar/PostShiftPage.tsx', {
    'react/jsx-runtime': { jsx, jsxs:jsx },
    'react-router-dom': { useNavigate: () => () => {}, useLocation: () => ({ search }) },
    '../../../contexts/AuthContext': { useAuth: () => auth },
    '../../../theme/sleekTheme': { useColorMode: () => ({ mode:'light' }) },
    '../../../utils/apiClient': { __esModule:true, default:{} },
    '../../../components/ui/PageHeader': display('PageHeader'),
    '../../../../shared/postShift/PostShiftForm': { __esModule:true, default:form.default },
    './ShiftsBoard/components/ShiftBoardPreview': display('ShiftBoardPreview'),
  });
  const admin = execute('../../src/pages/dashboard/admin/AdminPostShiftPage.tsx', {
    'react/jsx-runtime': { jsx, jsxs:jsx },
    '../../../contexts/AdminScopeContext': { useAdminScope: () => ({ pharmacyId:4 }) },
    '../sidebar/PostShiftPage': { __esModule:true, default:owner.default },
  });
  function flatten(element, key = 'root', output = []) {
    if (Array.isArray(element)) element.forEach((child,i) => flatten(child, key+'.'+i, output));
    else if (element && typeof element === 'object') {
      if (typeof element.type === 'function') {
        const fiberKey = key + ':' + element.type.name;
        if (!fibers.has(fiberKey)) fibers.set(fiberKey, { fields:[], effects:new Map() });
        const previous = active, previousCursor = cursor;
        active = fibers.get(fiberKey); cursor=0;
        const rendered = element.type(element.props);
        active = previous; cursor = previousCursor;
        flatten(rendered, fiberKey, output);
      } else {
        output.push(element);
        flatten(element.props?.children, key+'.children', output);
      }
    }
    return output;
  }
  const entry = persona === 'admin' ? admin.default : owner.default;
  const render = () => flatten(jsx(entry, persona === 'admin' ? {} : { onCompleted:callback }));
  async function settle() {
    for(let i=0;i<6;i++) {
      render();
      while(effects.length) effects.shift()();
      for(let j=0;j<8;j++) await Promise.resolve();
    }
    return render();
  }
  return { render, settle, submitted, completed,
    changeCallback(fn) { callback=fn; },
    changeContext(value) { search=value; } };
}

for (const persona of ['owner','admin']) {
  test('C: real '+persona+' PostShiftForm displays overnight events and submits unchanged draft clocks', async () => {
    const host = realPostShiftHost(persona);
    let nodes = await host.settle();
    const details = nodes.find(n => n.type === 'PostShiftDetailsStep');
    assert.ok(details, persona+' must mount the real details step');
    details.props.setRoleNeeded('PHARMACIST');
    details.props.setPharmacyId(4);
    nodes = await host.settle();
    let shell = nodes.find(n => n.type === 'PostShiftWizardShell');
    assert.ok(shell, 'real PostShiftForm must expose wizard actions');
    const step = shell.props.steps.findIndex(s => s.key === 'timetable');
    assert.ok(step >= 0);
    shell.props.setActiveStep(step);
    nodes = await host.settle();
    let dateStep = nodes.find(n => n.type === 'PostShiftTimetableStep');
    assert.ok(dateStep, 'actual timetable props must be rendered');
    dateStep.props.setSlots([slot('2027-01-10')]);
    nodes = await host.settle();
    dateStep = nodes.find(n => n.type === 'PostShiftTimetableStep');
    assert.equal(dateStep.props.calendarEvents.length, 1);
    assert.deepEqual(local(dateStep.props.calendarEvents[0]), {
      start:'2027-01-10T22:00', end:'2027-01-11T06:00',
    });
    // Change callbacks and time-context search without replacing the mounted form.
    host.changeCallback(() => host.completed.push('new callback'));
    host.changeContext('?context=rerender');
    nodes = await host.settle();
    dateStep = nodes.find(n => n.type === 'PostShiftTimetableStep');
    assert.equal(dateStep.props.slots[0].startTime, '22:00');
    assert.equal(dateStep.props.slots[0].endTime, '06:00');
    shell = nodes.find(n => n.type === 'PostShiftWizardShell');
    await shell.props.onSubmit();
    assert.equal(host.submitted.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(host.submitted[0].slots.map(s =>
      [s.date,s.start_time,s.end_time]))),
      [['2027-01-10','22:00','06:00']]);
    assert.equal(host.submitted[0].pharmacy, 4);
    if(persona === 'owner') assert.deepEqual(host.completed, ['new callback']);
  });
}
