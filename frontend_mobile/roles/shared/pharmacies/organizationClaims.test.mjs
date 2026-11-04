import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('./organizationClaims.ts', import.meta.url), 'utf8');
const result = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
const api = {};
vm.runInNewContext(result.outputText, { exports: api });
const { validatePharmacyClaimEmail, getActiveOrganizationId } = api;

test('claim form validates email before making a request', () => {
  assert.match(validatePharmacyClaimEmail('   '), /Enter/);
  assert.match(validatePharmacyClaimEmail('bad-email'), /valid/);
  assert.equal(validatePharmacyClaimEmail('  site@example.com  '), null);
});

test('organization claims require an active authorized organization membership', () => {
  assert.equal(getActiveOrganizationId({ memberships: [{ role: 'ORG_ADMIN', organization_id: 13 }] }), 13);
  assert.equal(getActiveOrganizationId({ memberships: [{ role: 'ORG_OWNER', organization_id: 13, is_active: false }] }), null);
  assert.equal(getActiveOrganizationId({ memberships: [{ role: 'OWNER', organization_id: 13 }] }), null);
  assert.equal(getActiveOrganizationId({ memberships: [{ role: 'ORG_STAFF', organization_id: 'abc' }] }), null);
  assert.equal(getActiveOrganizationId({ memberships: [{ role: 'ORG_STAFF', organization_id: 13.5 }] }), null);
  assert.equal(getActiveOrganizationId(null), null);
});
