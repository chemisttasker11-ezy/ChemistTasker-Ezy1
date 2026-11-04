import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('./receivedInvoicePolicy.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const context = { exports: {} };
runInNewContext(js, context);
const { receivedInvoiceActions } = context.exports;

test('received invoices can be approved only once and never after payment', () => {
  assert.equal(receivedInvoiceActions({ is_current: true, status: 'sent', review_status: 'PENDING' }).approve, true);
  assert.equal(receivedInvoiceActions({ is_current: true, status: 'sent', review_status: 'APPROVED_FOR_PAYMENT' }).approve, false);
  assert.equal(receivedInvoiceActions({ is_current: true, status: 'paid', review_status: 'PENDING' }).approve, false);
});
test('historical delivered revisions cannot be mutated', () => {
  assert.deepEqual({ ...receivedInvoiceActions({ is_current: false, status: 'sent', review_status: 'PENDING' }) }, { approve: false, revise: false, paid: false });
});
test('revision and paid controls keep the same web restrictions', () => {
  const approved = receivedInvoiceActions({ is_current: true, status: 'sent', review_status: 'APPROVED_FOR_PAYMENT' });
  assert.equal(approved.revise, true);
  assert.equal(approved.paid, true);
  const paid = receivedInvoiceActions({ is_current: true, status: 'paid', review_status: 'APPROVED_FOR_PAYMENT' });
  assert.equal(paid.revise, true);
  assert.equal(paid.paid, false);
});
test('managed detail opens the correct finance workspace with legacy fallback', () => {
  const route = readFileSync(new URL('./InvoiceDetail.tsx', import.meta.url), 'utf8');
  const workspace = readFileSync(new URL('./FinanceWorkspace.tsx', import.meta.url), 'utf8');
  assert.match(route, /finance\.receivedInvoice\(numericId\)/);
  assert.match(route, /finance\.invoice\(numericId\)/);
  assert.match(route, /getInvoiceDetail\(numericId\)/);
  assert.match(route, /router\.replace\(/);
  assert.match(workspace, /receivedMode \? receivedInvoices : invoices/);
  assert.match(workspace, /requestedInvoiceId/);
  assert.match(workspace, /receivedInvoiceActions\(selected\)\.approve/);
});
