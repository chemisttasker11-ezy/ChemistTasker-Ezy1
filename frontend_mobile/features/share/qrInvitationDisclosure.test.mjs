import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('./InviteFromWorkerQr.tsx', import.meta.url), 'utf8');

test('worker QR cannot misrepresent reusable pharmacy invitation as worker-targeted invite', () => {
  assert.match(source, /Create a pharmacy invitation link/);
  assert.match(source, /not addressed to that worker/);
  assert.match(source, /Anyone who receives it can apply/);
  assert.doesNotMatch(source, /Invite this professional to your pharmacy/);
});
test('QR invitation remains server-authorized and requires a public talent listing', () => {
  assert.match(source, /getPublicTalentFeed\(/);
  assert.match(source, /setVerified\(true\)/);
  assert.match(source, /createMembershipInviteLinkService\(/);
  assert.match(source, /hasCapability\('MANAGE_STAFF', id\)/);
  assert.match(source, /expires_in_days: 14/);
});
