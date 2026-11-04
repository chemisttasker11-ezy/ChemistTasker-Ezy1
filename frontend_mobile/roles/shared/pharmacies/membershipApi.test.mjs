import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('./membershipApi.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const exports = {};
const requested = [];
runInNewContext(outputText, {
  exports,
  require: (name) => {
    assert.equal(name, '@chemisttasker/shared-core');
    return { fetchMembershipsByPharmacy: async (id) => {
      requested.push(id);
      return [{ id: 6, employment_type: 'LOCUM' }];
    } };
  },
});

test('W4 membership read retains explicit pharmacy scope', async () => {
  assert.deepEqual(JSON.parse(JSON.stringify(await exports.fetchMembershipsForPharmacy(47))), [
    { id: 6, employment_type: 'LOCUM' },
  ]);
  assert.deepEqual(requested, [47]);
});

test('W4 staff and locums are disjoint for camelCase and server records', () => {
  const isLocum = exports.isLocumMembership;
  for (const employment of ['LOCUM', 'SHIFT_HERO']) {
    assert.equal(isLocum({ employment_type: employment }), true);
    assert.equal(isLocum({ employmentType: employment }), true);
  }
  for (const employment of ['FULL_TIME', 'PART_TIME', 'CASUAL', undefined]) {
    assert.equal(isLocum({ employment_type: employment }), false);
  }
});

test('W4 owner and organization pharmacy-level screens use matching manager routes', () => {
  const cases = [
    ['../../../roles/owner/pharmacies/[id]/staff.tsx', 'staff'],
    ['../../../roles/owner/pharmacies/[id]/locums.tsx', 'locum'],
    ['../../../app/organization/pharmacies/[id]/staff.tsx', 'staff'],
    ['../../../app/organization/pharmacies/[id]/locums.tsx', 'locum'],
  ];
  for (const [path, kind] of cases) {
    const screen = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.match(screen, new RegExp('kind="' + kind + '"'));
    assert.match(screen, /PharmacyMembersRoute/);
  }
});
