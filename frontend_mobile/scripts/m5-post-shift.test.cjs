// M5-04: execute the full shipping posting helper with a deterministic Sydney clock.
process.env.TZ = 'Australia/Sydney';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../node_modules/typescript');
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : ['2026-11-07T12:00:00+11:00'])); }
  static now() { return new Date('2026-11-07T12:00:00+11:00').getTime(); }
}
function loadHelpers() {
  const filename = path.resolve(__dirname, '../roles/shared/shifts/PostShiftScreen.helpers.ts');
  const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  const policyPath = path.resolve(__dirname, '../../shared-core/src/domains/shifts/postingWindow.ts');
  const policy = { exports: {} };
  if (fs.existsSync(policyPath)) {
    const policyJs = ts.transpileModule(fs.readFileSync(policyPath, 'utf8'), {
      fileName: policyPath,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    vm.runInNewContext(policyJs, { module: policy, exports: policy.exports, Date: FixedDate }, { filename: policyPath });
  }
  vm.runInNewContext(js, {
    module, exports: module.exports, Date: FixedDate, console, URLSearchParams,
    require(name) {
      if (name === '@chemisttasker/shared-core') return {
        getPharmacyHoursForDate: () => ({ startTime: '09:00', endTime: '17:00' }),
        isValidShiftPostingTimeRange: (start, end) => start !== end,
        ...policy.exports,
      };
      throw new Error('Unmocked import: ' + name);
    },
  }, { filename });
  return module.exports;
}
const entry = date => ({ date, startTime: '09:00', endTime: '17:00',
  isRecurring: false, recurringDays: [], recurringEndDate: '' });
test('R past_dates_message: posting helper rejects expired dates as an actual validation result', () => {
  const helper = loadHelpers();
  assert.equal(helper.validateSlotEntries([entry('2026-11-06')]),
    'That date has passed. Pick today or later.');
});
test('R window_range: posting helper rejects dates beyond the end of March 2027', () => {
  const helper = loadHelpers();
  assert.equal(helper.validateSlotEntries([entry('2027-04-01')]),
    'That date has passed. Pick today or later.');
});
test('C existing valid date and time controls are unchanged', () => {
  const helper = loadHelpers();
  assert.equal(helper.validateSlotEntries([entry('2026-11-07'), entry('2027-03-31')]), null);
  assert.equal(helper.validateSlotEntries([]), 'Select at least one date from the calendar.');
  assert.equal(helper.validateSlotEntries([entry('nope')]), 'Pick a date first.');
});

test('pharmacy wall date controls the posting window across device zones and DST', () => {
  const helper = loadHelpers();
  const cases = [
    ['Australia/Sydney', 'Australia/Perth', '2026-11-06T13:30:00Z', '2026-11-06'],
    ['Australia/Perth', 'Australia/Sydney', '2026-11-06T13:30:00Z', '2026-11-07'],
    ['Australia/Perth', 'Australia/Sydney', '2026-10-03T14:30:00Z', '2026-10-04'],
    ['Australia/Sydney', 'Australia/Sydney', '2026-11-06T13:30:00Z', '2026-11-07'],
  ];
  for (const [device, pharmacy, instant, expected] of cases) {
    process.env.TZ = device;
    const today = helper.pharmacyPostingDate(pharmacy, new Date(instant));
    assert.equal(today, expected, `${device} / ${pharmacy}`);
    assert.equal(helper.validateSlotEntries([entry(expected)], today), null);
    const yesterday = new Date(`${expected}T12:00:00Z`);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    assert.equal(helper.validateSlotEntries([entry(yesterday.toISOString().slice(0, 10))], today),
      'That date has passed. Pick today or later.');
  }
  process.env.TZ = 'Australia/Sydney';
});

test('posting screen supplies pharmacy date at every window decision', () => {
  const screen = fs.readFileSync(path.resolve(__dirname, '../roles/shared/shifts/PostShiftScreen.tsx'), 'utf8');
  assert.match(screen, /pharmacyPostingDate\(selectedPharmacy\?\.timezone/);
  assert.doesNotMatch(screen, /(?:shiftPostingDateWindow|splitPostableDates)\([^\n]*new Date\(\)/);
  assert.match(screen, /validateSlotEntries\(entries,\s*pharmacyToday/);
});

 test('final submit revalidates recurrence after switching pharmacy at a month boundary', () => {
  const screen = fs.readFileSync(path.resolve(__dirname, '../roles/shared/shifts/PostShiftScreen.tsx'), 'utf8');
  const submit = screen.slice(screen.indexOf('const handleSubmit = async'), screen.indexOf('const dismissToast'));
  assert.match(submit, /slot\.recurringEndDate/ );
  const helper = loadHelpers();
  for (const device of ['Australia/Sydney', 'America/Los_Angeles']) {
    process.env.TZ = device;
    const instant = new Date('2026-01-31T13:30:00Z');
    const slot = { ...entry('2026-02-01'), isRecurring: true, recurringDays: [1], recurringEndDate: '2026-06-01' };
    assert.equal(helper.validateSlotEntries([slot], helper.pharmacyPostingDate('Australia/Sydney', instant)), null);
    assert.notEqual(helper.validateSlotEntries([slot], helper.pharmacyPostingDate('Australia/Perth', instant)), null);
  }
});
