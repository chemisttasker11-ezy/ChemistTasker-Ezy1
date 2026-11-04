const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const source = readFileSync(resolve(__dirname, '../roles/shared/invoices/FinanceWorkspace.tsx'), 'utf8');

test('finance workspace uses canonical brand tokens instead of another visual kit', () => {
  assert.match(source, /colors, font, radius, space, touch/);
  assert.match(source, /borderRadius: radius\.card/);
  assert.match(source, /fontFamily: font\.outfit\.medium/);
});
test('failed invoice load shows recovery rather than falsely reporting an empty workspace', () => {
  assert.match(source, /Could not refresh this workspace/);
  assert.match(source, /onPress=\{\(\) => void run\(load\)\}/);
  assert.match(source, /!error && !invoices\.length/);
  assert.match(source, /!error && !receivedInvoices\.length/);
});
test('received review buttons obey web state policy and show disabled reason', () => {
  assert.match(source, /!receivedInvoiceActions\(selected\)\.approve/);
  assert.match(source, /already approved for payment/);
  assert.match(source, /already recorded for this invoice/);
});
