import { describe, expect, it } from 'vitest';
import { getShiftAudienceLevel, SHIFT_AUDIENCE_LEVELS } from './audience';

describe('M5-01 audience policy shared by web and native', () => {
  it('contains exactly the five web levels in escalation order with canonical reach text', () => {
    expect(SHIFT_AUDIENCE_LEVELS).toEqual([
      { key: 'FULL_PART_TIME', label: 'My Pharmacy', reach: 'your full-time and part-time team', scope: 'internal' },
      { key: 'LOCUM_CASUAL', label: 'Favourites', reach: 'your favourite locums and casuals', scope: 'internal' },
      { key: 'OWNER_CHAIN', label: 'Chain', reach: 'staff across your other pharmacies', scope: 'internal' },
      { key: 'ORG_CHAIN', label: 'Organization', reach: 'members of your organisation', scope: 'internal', requiresOrganization: true },
      { key: 'PLATFORM', label: 'ChemistTasker', reach: 'verified professionals across ChemistTasker', scope: 'platform' },
    ]);
  });
  it('returns exact canonical objects for known keys and undefined for unknown or null keys', () => {
    for (const level of SHIFT_AUDIENCE_LEVELS) expect(getShiftAudienceLevel(level.key)).toBe(level);
    expect(getShiftAudienceLevel('BAD')).toBeUndefined();
    expect(getShiftAudienceLevel(null)).toBeUndefined();
  });
});
