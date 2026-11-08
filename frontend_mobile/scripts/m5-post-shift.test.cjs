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
