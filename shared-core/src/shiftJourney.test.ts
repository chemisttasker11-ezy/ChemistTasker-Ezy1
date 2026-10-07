import { describe, expect, it } from 'vitest';
import type { Shift } from './types';
import { getShiftEscalation, getShiftJourneyStatus } from './shiftJourney';

const shift = (fields: Partial<Shift> = {}) => ({ status: 'OPEN', visibility: 'LOCUM_CASUAL', slots: [], ...fields } as Shift);

describe('shift journey labels', () => {
  it('does not claim a past shift was completed without a completed status', () => {
    expect(getShiftJourneyStatus(shift(), { section: 'history' }).label).toBe('Past shift');
    expect(getShiftJourneyStatus(shift({ status: 'COMPLETED' }), { section: 'history' }).label).toBe('Completed');
    expect(getShiftJourneyStatus(shift({ status: 'CANCELLED' }), { section: 'history' }).label).toBe('Cancelled');
  });

  it('prioritises payment before responses and reports partial coverage', () => {
    expect(getShiftJourneyStatus(shift(), { paymentRequired: true, interestedCount: 2 }).label).toBe('Payment required');
    expect(getShiftJourneyStatus(shift(), { interestedCount: 2 }).label).toBe('Responses to review');
    expect(getShiftJourneyStatus(shift({ slotAssignments: [{ slotId: 1, userId: 2 }] as Shift['slotAssignments'] })).label).toBe('Some slots assigned');
  });

  it('only names permitted escalation stages', () => {
    const result = getShiftEscalation(shift({ allowedEscalationLevels: ['LOCUM_CASUAL', 'PLATFORM'] }));
    expect(result.stages.map((stage) => stage.key)).toEqual(['LOCUM_CASUAL', 'PLATFORM']);
    expect(result.next?.key).toBe('PLATFORM');
  });
});
