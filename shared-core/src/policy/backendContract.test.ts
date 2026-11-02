import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
const cases: { name: string; target_id: number; user: Parameters<typeof canManageKioskDevices>[0]; expected: boolean }[] = JSON.parse(readFileSync(new URL('../../../backend/testing/contracts/kiosk_authority.json', import.meta.url), 'utf8'));
import { canManageKioskDevices } from './accessPolicy';

describe('Django and client kiosk authority representative contract', () => {
  for (const row of cases) {
    it(row.name, () => {
      expect(canManageKioskDevices(row.user, row.target_id)).toBe(row.expected);
    });
  }
});
