import type { Shift } from '../../types';

/** Respect the backend's PR166 pay redaction; never infer a hidden internal rate. */
export function bookedShiftRateLabel(shift: Shift): string {
  if (shift.publishedRatesVisible === false) return 'Internal staff arrangement';
  if (shift.roleNeeded === 'PHARMACIST') {
    if (shift.rateType === 'FIXED') {
      return shift.fixedRate != null && shift.fixedRate !== ''
        ? `$${shift.fixedRate}/hr fixed`
        : 'Rate not available';
    }
    if (shift.rateType === 'PHARMACIST_PROVIDED') return 'Your provided rate';
    return 'Flexible rate';
  }
  return shift.ownerAdjustedRate != null && shift.ownerAdjustedRate !== '' && Number(shift.ownerAdjustedRate) !== 0
    ? `Award rate + $${shift.ownerAdjustedRate}/hr bonus`
    : 'Award rate';
}
