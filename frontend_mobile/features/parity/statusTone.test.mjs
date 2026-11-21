import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const { outputText } = ts.transpileModule(readFileSync(new URL('./statusTone.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});
const exports = {};
vm.runInNewContext(outputText, { exports });
const { statusToneFor } = exports;

test('status words map to pill tones', () => {
  const cases = {
    APPROVED: 'green', Confirmed: 'green', Active: 'green', PAID: 'green', ACCEPTED: 'green', Ready: 'green',
    Pending: 'amber', 'Evidence pending': 'amber', DRAFT: 'amber', 'Partially paid': 'amber',
    REJECTED: 'red', Declined: 'red', Revoked: 'red', CANCELLED: 'red', Overdue: 'red', 'Action needed': 'red',
    Published: 'violet', OPEN: 'violet', Selected: 'violet',
    Inactive: 'neutral', Unpublished: 'neutral', unpaid: 'neutral', checked: 'neutral', '': 'neutral',
    'Leave: REJECTED': 'red', 'PUBLISHED / PENDING': 'amber',
    'REJECTED PENDING': 'red', 'APPROVED OPEN': 'green',
  };
  for (const [status, tone] of Object.entries(cases)) assert.equal(statusToneFor(status), tone, status);
});
