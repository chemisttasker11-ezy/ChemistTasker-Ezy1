const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../node_modules/typescript');
const filename = path.resolve(__dirname, '../roles/shared/shifts/ShiftsBoard/utils/shift.ts');
const moduleUnderTest = { exports: {} };
let now = '2026-01-31T22:00:00Z';
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return new Date(now).getTime(); }
}
const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText;
vm.runInNewContext(code, {module: moduleUnderTest, exports: moduleUnderTest.exports, Date: FixedDate, require}, {filename});
test('upcoming slots use pharmacy time independent of device timezone', () => {
  for (const device of ['Australia/Sydney', 'America/Los_Angeles']) {
    process.env.TZ = device;
    const slots = [{id: 1, date: '2026-02-01', startTime: '08:00'}, {id: 2, date: '2026-02-01', startTime: '05:00'}];
    const result = moduleUnderTest.exports.getUpcomingSlotsForDisplay(slots, {timezone: 'Australia/Perth'});
    assert.deepEqual(Array.from(result, x => x.id), [1]);
  }
});
test('recurring dates retain their calendar day west of UTC', () => {
  process.env.TZ = 'America/Los_Angeles';
  const slots = [{id: 1, date: '2026-02-01', startTime: '08:00', isRecurring: true, recurringDays: [0], recurringEndDate: '2026-02-08'}];
  const result = moduleUnderTest.exports.getUpcomingSlotsForDisplay(slots, {timezone: 'Australia/Perth'});
  assert.deepEqual(Array.from(result, x => x.date), ['2026-02-01', '2026-02-08']);
});

test('DST repeated clock uses the first occurrence like the server', () => {
  now = '2026-04-04T16:00:00Z';
  const slots = [{id: 1, date: '2026-04-05', startTime: '02:30'}];
  assert.equal(moduleUnderTest.exports.getUpcomingSlotsForDisplay(slots, {timezone: 'Australia/Sydney'}).length, 0);
});
