import { describe, expect, it } from 'vitest';
import { ageFromBirthDate, newcomerTypeLabel } from './newcomer';

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
