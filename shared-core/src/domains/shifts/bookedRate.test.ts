import { describe, expect, it } from 'vitest';
import type { Shift } from '../../types';
import { bookedShiftRateLabel } from './bookedRate';

const shift = (overrides: Partial<Shift>): Shift => ({ id: 1, roleNeeded: 'PHARMACIST', visibility: 'PUBLIC', ...overrides } as Shift);

describe('PR166 booked-shift pay visibility', () => {
  it('does not leak or stringify a redacted fixed rate', () => {
    expect(bookedShiftRateLabel(shift({ publishedRatesVisible: false, rateType: 'FIXED' }))).toBe('Internal staff arrangement');
  });
  it('never renders undefined when fixed rate is absent', () => {
    expect(bookedShiftRateLabel(shift({ rateType: 'FIXED' }))).toBe('Rate not available');
  });
  it('preserves visible pharmacist fixed and provided rates', () => {
    expect(bookedShiftRateLabel(shift({ rateType: 'FIXED', fixedRate: '75.00' }))).toBe('$75.00/hr fixed');
    expect(bookedShiftRateLabel(shift({ rateType: 'PHARMACIST_PROVIDED' }))).toBe('Your provided rate');
  });
  it('preserves visible award bonus and redacts it when internal', () => {
    expect(bookedShiftRateLabel(shift({ roleNeeded: 'PHARMACY_ASSISTANT', ownerAdjustedRate: '3.00' }))).toBe('Award rate + $3.00/hr bonus');
    expect(bookedShiftRateLabel(shift({ roleNeeded: 'PHARMACY_ASSISTANT', ownerAdjustedRate: '3.00', publishedRatesVisible: false }))).toBe('Internal staff arrangement');
  });
});
