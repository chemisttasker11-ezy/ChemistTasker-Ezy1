import { autoEscalationDates } from './context';

/** The backend owns relationship policy and removes hidden financial data. */
export function showPublishedShiftRates(shift: { publishedRatesVisible?: boolean }): boolean {
  return shift.publishedRatesVisible !== false;
}

/** Chain outreach requires the selected pharmacy's own chain tier, not just a wide audience. */
export function canNotifyShiftChainMembers(allowedTiers: readonly string[], visibility: string): boolean {
  const chainIndex = allowedTiers.indexOf('OWNER_CHAIN');
  const audienceIndex = allowedTiers.indexOf(visibility);
  return chainIndex >= 0 && audienceIndex >= chainIndex;
}

export type ShiftEscalationMode = 'auto' | 'custom' | 'off';
export interface ShiftEscalationPlan { mode: ShiftEscalationMode; everyHours: number }

export function automaticShiftEscalationDates(allowedTiers: readonly string[], visibility: string, everyHours: number, from?: Date) {
  const index = allowedTiers.indexOf(visibility);
  return autoEscalationDates(index < 0 ? [] : allowedTiers.slice(index + 1), everyHours, from);
}

/** Direct booking is domain state, independent of modal/embedded presentation. */
export function isPrivateShiftBooking(dedicatedUserId: unknown): boolean {
  return dedicatedUserId != null && Number.isInteger(Number(dedicatedUserId)) && Number(dedicatedUserId) > 0;
}
