import { describe, expect, it } from 'vitest';
import { UPGRADE_COPY, ageFromBirthDate, newcomerTypeLabel } from './newcomer';
import { VERIFICATION_GUIDE, verifiedProfileExplainer } from './verification';

describe('new to pharmacy', () => {
  it('counts whole years and rejects malformed dates', () => {
    const today = new Date(2026, 9, 13);
    expect(ageFromBirthDate('2011-10-13', today)).toBe(15);
    expect(ageFromBirthDate('2011-10-14', today)).toBe(14);
    expect(ageFromBirthDate('13/10/2011', today)).toBeNull();
  });
  it('labels the sign-up answer', () => {
    expect(newcomerTypeLabel('overseas')).toBe('Overseas-qualified');
    expect(newcomerTypeLabel('EXPLORER')).toBeNull();
  });
});

describe('verification wording never claims a check that did not happen (review 2026-10-14)', () => {
  it('the general guide names the overseas exception and gives no guarantee', () => {
    const text = VERIFICATION_GUIDE.items.find(item => item.term === 'Verified profile')?.text || '';
    expect(text).toMatch(/overseas/i);
    expect(text).toMatch(/does not vouch/i);
  });
  it('a profile verified without an Australian mobile makes no email or mobile claim', () => {
    expect(verifiedProfileExplainer('EXPLORER', { mobileWaived: true })).not.toMatch(/mobile confirmed|email/i);
    expect(verifiedProfileExplainer('PHARMACIST', { mobileWaived: false })).toMatch(/AHPRA/);
  });
  it('the upgrade copy says the talent post is removed', () => {
    expect(UPGRADE_COPY.postRemoved).toMatch(/removed/);
  });
});
