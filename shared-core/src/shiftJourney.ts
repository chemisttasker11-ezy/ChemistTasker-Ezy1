import type { Shift } from './types';

/** Presentation only. Eligibility, escalation and assignment remain server decisions. */
export const SHIFT_ESCALATION_STAGES = [
  { key: 'FULL_PART_TIME', label: 'My pharmacy', description: 'Your pharmacy team', level: 1, color: '#06214A' },
  { key: 'LOCUM_CASUAL', label: 'Favourites', description: 'Your favourite staff and locums', level: 2, color: '#5222B8' },
  { key: 'OWNER_CHAIN', label: 'Owner chain', description: 'Staff across your pharmacies', level: 3, color: '#AD009F' },
  { key: 'ORG_CHAIN', label: 'Organisation', description: 'Your organisation network', level: 4, color: '#0078B8' },
  { key: 'PLATFORM', label: 'Public platform', description: 'The wider ChemistTasker community', level: 5, color: '#007C8A' },
] as const;

export type ShiftAudienceKey = typeof SHIFT_ESCALATION_STAGES[number]['key'];
export type ShiftJourneySection = 'active' | 'confirmed' | 'history';
export type ShiftJourneyTone = 'info' | 'success' | 'warning' | 'error' | 'default';

export function getShiftAudience(key?: string | null) {
  return SHIFT_ESCALATION_STAGES.find((stage) => stage.key === key);
}

export function getShiftEscalation(shift: Pick<Shift, 'visibility' | 'allowedEscalationLevels'>) {
  const allowed = shift.allowedEscalationLevels;
  const stages = allowed?.length
    ? SHIFT_ESCALATION_STAGES.filter((stage) => allowed.includes(stage.key))
    : [...SHIFT_ESCALATION_STAGES];
  const current = getShiftAudience(shift.visibility);
  const currentIndex = stages.findIndex((stage) => stage.key === shift.visibility);
  return {
    stages,
    current,
    reached: currentIndex < 0 ? [] : stages.slice(0, currentIndex + 1),
    next: currentIndex < 0 ? undefined : stages[currentIndex + 1],
  };
}

export function formatShiftLabel(value?: string | null): string {
  if (!value) return '';
  return value.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (char) => char.toUpperCase());
}

type JourneyOptions = {
  section?: ShiftJourneySection;
  paymentRequired?: boolean;
  interestedCount?: number;
  pendingConfirmationCount?: number;
  responsesReady?: boolean;
};

export function getShiftJourneyStatus(shift: Pick<Shift, 'status' | 'pendingPaymentSlotIds' | 'slotAssignments'>, options: JourneyOptions = {}) {
  const state = (key: string, label: string, tone: ShiftJourneyTone, description: string) => ({ key, label, tone, description });
  const status = String(shift.status ?? '').toUpperCase();
  if (status === 'CANCELLED') return state('cancelled', 'Cancelled', 'default', 'This post has been cancelled.');
  if (status === 'COMPLETED') return state('completed', 'Completed', 'success', 'Review the assignment and leave feedback.');
  // Being in history is not evidence that work was completed or that attendance was recorded.
  if (options.section === 'history') return state('past', 'Past shift', 'default', 'Review past slots, assignments and feedback.');
  if (options.section === 'confirmed') return state('confirmed', 'Confirmed', 'success', 'View the assigned team member and shift details.');
  if (options.paymentRequired || shift.pendingPaymentSlotIds?.length) {
    return state('payment', 'Payment required', 'warning', 'Complete payment to finalise the selected assignment.');
  }
  if (options.interestedCount) return state('responses', 'Responses to review', 'info', 'Review interested candidates and counter offers.');
  if (options.pendingConfirmationCount) return state('confirmation', 'Awaiting confirmation', 'warning', 'An offer is waiting for the candidate to confirm.');
  if (shift.slotAssignments?.length) return state('partial', 'Some slots assigned', 'info', 'Review the remaining slots and candidate responses.');
  if (options.responsesReady === false) return state('loading', 'Posted', 'default', 'Candidate responses are loading.');
  return state('posted', 'Posted', 'info', 'Track responses or widen the audience when you are ready.');
}

export function getShiftSearchText(shift: Shift): string {
  return [shift.id, shift.pharmacyDetail?.name, shift.pharmacyName, shift.roleLabel,
    formatShiftLabel(shift.roleNeeded), formatShiftLabel(shift.employmentType),
    shift.pharmacyDetail?.suburb, shift.pharmacyDetail?.state,
    ...(shift.slots ?? []).map((slot) => slot.date)]
    .filter((value) => value != null).join(' ').toLowerCase();
}
