import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const { outputText } = ts.transpileModule(readFileSync(new URL('./registerRole.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});
const exports = {};
vm.runInNewContext(outputText, { exports });
const { registerRoleFromParam } = exports;

test('the four sign-up roles pass through', () => {
  for (const role of ['OWNER', 'PHARMACIST', 'OTHER_STAFF', 'EXPLORER']) assert.equal(registerRoleFromParam(role), role);
});

test('arrays use their first value only', () => {
  assert.equal(registerRoleFromParam(['PHARMACIST', 'OWNER']), 'PHARMACIST');
  assert.equal(registerRoleFromParam(['ORG_ADMIN', 'OWNER']), '');
  assert.equal(registerRoleFromParam([]), '');
});

test('anything else is ignored', () => {
  for (const raw of [undefined, '', 'owner', 'other-staff', 'ORG_ADMIN', 'ADMIN', 'OWNER ', 'toString', '__proto__']) {
    assert.equal(registerRoleFromParam(raw), '', String(raw));
  }
});
