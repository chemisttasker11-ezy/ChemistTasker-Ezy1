import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function loadTs(path, imports = {}) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const result = {};
  vm.runInNewContext(outputText, {
    exports: result,
    require: (name) => {
      assert.ok(name in imports, `Unexpected import: ${name}`);
      return imports[name];
    },
  });
  return result;
}

const surface = loadTs('./shiftSurface.ts');
const logic = loadTs('./shiftsScreenLogic.ts', { './shiftSurface': surface });
const constants = loadTs('./ShiftsBoard/constants.ts');
const { resolveShiftSurface } = surface;
const { shiftStorageKey, COUNTER_OFFER_STORAGE_KEY, SAVED_STORAGE_KEY } = constants;
const caps = (grants) => (capability, pharmacyId) => Boolean(grants[pharmacyId]?.includes(capability));

test('board storage keys are namespaced by persona, workspace, pharmacy and user', () => {
  const key = (input) => shiftStorageKey(SAVED_STORAGE_KEY, resolveShiftSurface(input).scopeKey);
  const pharmacist = { pathname: '/pharmacist/shifts', role: 'PHARMACIST', userId: 7, workspace: 'platform', canUsePlatform: true };
  assert.equal(key(pharmacist), 'saved_shift_ids:pharmacist:platform:all:7');
  assert.equal(key(pharmacist), key({ ...pharmacist }), 'same scope, same key');
  // Each part of the scope changes the key, so markers never leak across accounts, personas or workspaces.
  assert.notEqual(key(pharmacist), key({ ...pharmacist, userId: 8 }));
  assert.notEqual(key(pharmacist), key({ ...pharmacist, workspace: 'internal' }));
  assert.notEqual(key(pharmacist), key({ ...pharmacist, pathname: '/otherstaff/shifts', role: 'OTHER_STAFF' }));
  const admin = { pathname: '/admin/shifts', role: 'PHARMACIST', userId: 7, adminPharmacyId: 3, hasCapability: caps({ 3: ['MANAGE_ROSTER'] }) };
  assert.equal(key(admin), 'saved_shift_ids:admin:all:3:7');
  assert.notEqual(key(admin), key({ ...admin, adminPharmacyId: 4 }));
  assert.equal(shiftStorageKey(COUNTER_OFFER_STORAGE_KEY, 'explorer:platform:all:9'), 'counter_offer_map:explorer:platform:all:9');
  // The old global key is never what a scoped board reads.
  assert.notEqual(key(pharmacist), SAVED_STORAGE_KEY);
});

test('only internal pharmacists and other staff get the My roster link, and it opens the in-shell roster tab', () => {
  const { workerRosterRoute } = logic;
  assert.equal(workerRosterRoute({ persona: 'pharmacist', workspace: 'internal' }), '/pharmacist/roster');
  assert.equal(workerRosterRoute({ persona: 'otherstaff', workspace: 'internal' }), '/otherstaff/roster');
  assert.equal(workerRosterRoute({ persona: 'pharmacist', workspace: 'platform' }), null);
  assert.equal(workerRosterRoute({ persona: 'explorer', workspace: 'platform' }), null);
  for (const persona of ['owner', 'organization', 'admin']) assert.equal(workerRosterRoute({ persona, workspace: null }), null);
});

test('History invoices: pharmacists and other staff use their own route, explorers have none', () => {
  const { workerInvoiceRoute, shiftSectionSubtitle } = logic;
  assert.equal(workerInvoiceRoute('pharmacist'), '/pharmacist/invoice/new');
  assert.equal(workerInvoiceRoute('otherstaff'), '/otherstaff/invoice/new');
  assert.equal(workerInvoiceRoute('explorer'), undefined);
  assert.equal(workerInvoiceRoute('owner'), undefined);
  assert.match(shiftSectionSubtitle('history', 'pharmacist'), /invoice/);
  assert.doesNotMatch(shiftSectionSubtitle('history', 'explorer'), /invoice/);
  assert.match(shiftSectionSubtitle('confirmed', 'otherstaff'), /locked rate/);
  assert.doesNotMatch(shiftSectionSubtitle('confirmed', 'owner'), /locked rate/);
});

test('?tab=accepted opens Offers; other tabs leave the board default', () => {
  const { incomingBoardTab } = logic;
  assert.equal(incomingBoardTab('accepted'), 'accepted');
  assert.equal(incomingBoardTab('ACCEPTED'), 'accepted');
  for (const tab of [undefined, null, '', 'saved', 'browse']) assert.equal(incomingBoardTab(tab), undefined);
});

test('?tab=accepted shows the workspace board over ?section=; without it the section stands', () => {
  const { shownShiftSection } = logic;
  const { shiftSections } = surface;
  const shown = (input, section, tab) => {
    const resolved = resolveShiftSurface(input);
    return shownShiftSection(section, shiftSections(resolved), resolved.workspace, tab);
  };
  const internal = { pathname: '/pharmacist/shifts', workspace: 'internal' };
  const platform = { pathname: '/otherstaff/shifts', workspace: 'platform', canUsePlatform: true };
  assert.equal(shown(internal, 'history', 'accepted'), 'community');
  assert.equal(shown(internal, 'confirmed', 'ACCEPTED'), 'community');
  assert.equal(shown(platform, 'history', 'accepted'), 'public');
  assert.equal(shown({ pathname: '/explorer/shifts' }, 'history', 'accepted'), 'public');
  // A section tap clears ?tab=, so the requested section shows again.
  assert.equal(shown(internal, 'history', undefined), 'history');
  assert.equal(shown(internal, 'history', 'saved'), 'history');
  // Posters have no board: ?tab=accepted leaves the Shift Centre section alone.
  assert.equal(shown({ pathname: '/owner/shifts' }, 'history', 'accepted'), 'history');
  assert.equal(shown({ pathname: '/owner/shifts' }, null, 'accepted'), null);
});

test('every persona gets its sections; a worker board follows the workspace', () => {
  const { shiftSections } = surface;
  const sections = (input) => [...shiftSections(resolveShiftSurface(input))];
  assert.deepEqual(sections({ pathname: '/owner/shifts' }), ['active', 'confirmed', 'history']);
  assert.deepEqual(sections({ pathname: '/organization/shifts' }), ['active', 'confirmed', 'history']);
  assert.deepEqual(sections({ pathname: '/admin/shifts' }), ['active', 'confirmed', 'history']);
  assert.deepEqual(sections({ pathname: '/pharmacist/shifts', workspace: 'internal' }), ['community', 'confirmed', 'history']);
  assert.deepEqual(sections({ pathname: '/otherstaff/shifts', workspace: 'platform', canUsePlatform: true }), ['public', 'confirmed', 'history']);
  // Platform asked for but not allowed: the worker stays on Community.
  assert.deepEqual(sections({ pathname: '/pharmacist/shifts', workspace: 'platform', canUsePlatform: false }), ['community', 'confirmed', 'history']);
  assert.deepEqual(sections({ pathname: '/explorer/shifts' }), ['public', 'community', 'confirmed', 'history']);
  assert.equal(resolveShiftSurface({ pathname: '/explorer/shifts' }).publicOnly, true, 'explorer Community is the locked state');
  assert.equal(resolveShiftSurface({ pathname: '/pharmacist/shifts' }).publicOnly, false);
});
