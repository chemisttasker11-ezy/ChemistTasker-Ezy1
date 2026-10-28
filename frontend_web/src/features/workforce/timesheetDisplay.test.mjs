import { test } from 'node:test';
import assert from 'node:assert/strict';
import { approveButtonLabel, formatHours, timesheetStatus, plural } from './timesheetDisplay.ts';

test('formatHours formats attendance minutes into hours and minutes display', () => {
  assert.equal(formatHours(505), '8 h 25 min');
  assert.equal(formatHours(425), '7 h 05 min');
  assert.equal(formatHours(450), '7 h 30 min');
  assert.equal(formatHours(0), '0 h 00 min');
  assert.equal(formatHours(60), '1 h 00 min');
  assert.equal(formatHours(75), '1 h 15 min');
});

test('formatHours formats negative minutes with leading sign', () => {
  assert.equal(formatHours(-45), '-0 h 45 min');
  assert.equal(formatHours(-75), '-1 h 15 min');
});

test('formatHours handles nullish, non-numeric and non-finite values with em-dash', () => {
  assert.equal(formatHours(null), '—');
  assert.equal(formatHours(undefined), '—');
  assert.equal(formatHours(NaN), '—');
  assert.equal(formatHours(Infinity), '—');
  assert.equal(formatHours(-Infinity), '—');
});

test('approveButtonLabel formats approval label using worked minutes', () => {
  // D4 / A4: reviewed 0 / worked 425 -> "Approve 7 h 05 min"
  assert.equal(approveButtonLabel(425), 'Approve 7 h 05 min');
  assert.equal(approveButtonLabel({ worked_minutes: 425, reviewed_minutes: 0 }), 'Approve 7 h 05 min');
  assert.equal(approveButtonLabel({ worked_minutes: 505, reviewed_minutes: 450 }), 'Approve 8 h 25 min');
  assert.equal(approveButtonLabel(0), 'Approve 0 h 00 min');
  assert.equal(approveButtonLabel({ worked_minutes: 0, reviewed_minutes: 0 }), 'Approve 0 h 00 min');
  assert.equal(approveButtonLabel(null), 'Approve —');
  assert.equal(approveButtonLabel(undefined), 'Approve —');
  assert.equal(approveButtonLabel({ worked_minutes: null }), 'Approve —');
});

test('timesheetStatus resolves known and unknown status displays', () => {
  assert.deepEqual(timesheetStatus('OPEN'), {
    label: 'Open',
    tone: 'neutral',
    hint: 'Still collecting attendance for this period.',
  });
  assert.deepEqual(timesheetStatus('NEEDS_REVIEW'), {
    label: 'Needs review',
    tone: 'amber',
    hint: 'Has checks to resolve before it can be approved.',
  });
  assert.deepEqual(timesheetStatus('APPROVED'), {
    label: 'Approved',
    tone: 'green',
    hint: 'Hours approved for this revision.',
  });
  assert.deepEqual(timesheetStatus('CUSTOM_STATUS'), {
    label: 'custom status',
    tone: 'neutral',
    hint: '',
  });
});

test('plural formats count with correct noun suffix', () => {
  assert.equal(plural(1, 'check'), '1 check');
  assert.equal(plural(2, 'check'), '2 checks');
  assert.equal(plural(0, 'day'), '0 days');
  assert.equal(plural(1, 'box', 'boxes'), '1 box');
  assert.equal(plural(3, 'box', 'boxes'), '3 boxes');
});
