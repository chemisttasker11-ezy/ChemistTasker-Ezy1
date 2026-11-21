import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../shared/postShift/useShiftTimetable.ts', import.meta.url), 'utf8');
const core = readFileSync(new URL('../../shared-core/src/domains/shifts/postingDraft.ts', import.meta.url), 'utf8');
const coreJs = ts.transpileModule(core, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const coreModule = { exports: {} };
runInNewContext(coreJs, { exports: coreModule.exports, module: coreModule, require: () => ({}) });

for (const [name, next] of [['handleAddManualSlot', 'handleAddSelectedDate'], ['handleAddSelectedDate', 'handleAddAllSelectedDates'], ['handleAddAllSelectedDates', 'handleEditSlot']]) {
  test(`${name} validates daytime, overnight, equal and malformed times`, () => {
    const start = source.indexOf(`const ${name} =`);
    const end = source.indexOf(`const ${next} =`, start);
    assert.ok(start >= 0 && end > start);
    const js = ts.transpileModule(`${source.slice(start, end)}; ${name};`, {}).outputText;
    for (const [startTime, endTime, expected] of [['22:00', '06:00', true], ['09:00', '17:00', true], ['09:00', '09:00', false], ['bad', '17:00', false]]) {
      const context = {
        slotStartTime: startTime, slotEndTime: endTime, slotDate: '2099-01-01', isRecurring: false,
        selectedDates: ['2099-01-01'], selectedDateTimes: {}, todayStart: {},
        dayjs: () => ({ isBefore: () => false }), setTimetableError: () => {}, showSnackbar: () => {},
        addSlotEntries: () => true, isValidShiftPostingTimeRange: coreModule.exports.isValidShiftPostingTimeRange,
      };
      assert.equal(runInNewContext(js, context)('2099-01-01'), expected, `${startTime}-${endTime}`);
    }
  });
}
