const test = require('node:test');
const assert = require('node:assert/strict');
const { csvCell, dueDate, dollars } = require('../.finance-test-build/helpers.cjs');

test('CSV values quote delimiters and embedded quotes', () => {
  assert.equal(csvCell('Store, "North"'), '"Store, ""North"""');
});
test('CSV values neutralise spreadsheet formula introducers and leading whitespace', () => {
  for (const text of ['=1+1', '+1', '-2', '@SUM(A1)', '  =1+1', '\t=1', '\r=1', '\n=1']) {
    assert.equal(csvCell(text).slice(0, 2), '"\'');
  }
  assert.equal(csvCell('100.00'), '"100.00"');
});
test('payment terms handle month, year and leap-day boundaries', () => {
  assert.equal(dueDate('2026-09-17', 14), '2026-10-01');
  assert.equal(dueDate('2026-12-31', 1), '2027-01-01');
  assert.equal(dueDate('2024-02-28', 1), '2024-02-29');
  assert.equal(dueDate('2026-09-17', 0), '2026-09-17');
});
test('invalid dates and payment terms do not generate NaN form values', () => {
  for (const value of ['', 'bad', '2025-02-29', '2026-13-01']) assert.equal(dueDate(value, 14), '');
  for (const days of [-1, 366, NaN, 1.5]) assert.equal(dueDate('2026-09-17', days), '');
});
test('amounts are displayed as AUD without changing source values', () => {
  const source = '1234.50'; assert.equal(dollars(source), '$1,234.50'); assert.equal(source, '1234.50');
});
