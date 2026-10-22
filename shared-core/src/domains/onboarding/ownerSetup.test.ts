import { describe, expect, it } from 'vitest';
import { countOwnedPharmaciesFromUser } from './ownerSetup';

describe('owner onboarding pharmacy count parity', () => {
  it('keeps the original preferred nonempty list precedence', () => {
    const user = { owned_pharmacies: [{ id: 1 }, { id: 1 }], memberships: [{ role: 'OWNER', pharmacy_id: 99 }] };
    expect(countOwnedPharmaciesFromUser(user)).toBe(2);
  });
  it('falls back to distinct owned pharmacy memberships', () => {
    const user = { memberships: [
      { role: 'OWNER', pharmacy_id: 8 },
      { role: 'PHARMACY_OWNER', pharmacy_id: 8 },
      { role: 'CONTACT', is_pharmacy_owner: true, pharmacy_id: '9' },
      { role: 'PHARMACIST', pharmacy_id: 10 },
      { role: 'OWNER', pharmacy_id: 'invalid' },
    ] };
    expect(countOwnedPharmaciesFromUser(user)).toBe(2);
  });
  it('returns zero for missing, unowned or invalid data', () => {
    expect(countOwnedPharmaciesFromUser(null)).toBe(0);
    expect(countOwnedPharmaciesFromUser({ memberships: [{ role: 'STAFF', pharmacy_id: 4 }] })).toBe(0);
    expect(countOwnedPharmaciesFromUser({ memberships: null })).toBe(0);
  });
});
