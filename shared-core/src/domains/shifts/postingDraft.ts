import { buildShiftDraftSlotPayload, type ShiftDraftSlot, type ShiftDraftOccurrence } from './draftSlots';
import { isPrivateShiftBooking } from './visibility';

/** Pure posting state shared by web and native; host presentation/state stays outside this domain. */
export interface ShiftPostingDraft {
  pharmacyId: number | ''; roleNeeded: string; employmentType: string; description: string;
  workloadTags: string[]; supportOnShift: { role: string; count: number }[]; mustHave: string[]; niceToHave: string[];
  visibility: string; escalationDates: Record<string, string | null | undefined>; dedicatedUserId: number | null;
  editingShiftId: string | number | null; flexibleTiming: boolean; singleUserOnly: boolean;
  postAnonymously: boolean; canPostAnonymously: boolean; hasTravel: boolean; hasAccommodation: boolean; isUrgent: boolean;
  slots: ShiftDraftSlot[]; expandedSlots: ShiftDraftOccurrence[]; slotRateRows: { rate: string }[];
  rateType: string; ownerBonus: string; paymentPreference: string; locumSuperIncluded: boolean; defaultSuperPercent: number;
  rateWeekday: string; rateSaturday: string; rateSunday: string; ratePublicHoliday: string; rateEarlyMorning: string; rateLateNight: string;
  ftptPayMode: 'HOURLY' | 'ANNUAL'; minHourly: string; maxHourly: string; minAnnual: string; maxAnnual: string; superPercent: string;
  showNotifyPharmacyStaff: boolean; showNotifyFavoriteStaff: boolean; showNotifyChainMembers: boolean;
  notifyPharmacyStaff: boolean; notifyFavoriteStaff: boolean; notifyChainMembers: boolean;
}

export function validateShiftPostingDraft(draft: Pick<ShiftPostingDraft, 'pharmacyId'|'roleNeeded'|'employmentType'|'slots'|'ftptPayMode'|'minHourly'|'maxHourly'|'minAnnual'|'maxAnnual'|'superPercent'>): string | null {
  if (!draft.pharmacyId || !draft.roleNeeded || !draft.employmentType) return 'Choose a pharmacy, role and type of work.';
  const locum = ['LOCUM', 'CASUAL'].includes(draft.employmentType);
  if (locum && !draft.slots.length) return 'Add at least one date before posting.';
  if (!locum && draft.ftptPayMode === 'HOURLY' && (!draft.minHourly || !draft.maxHourly)) return 'Enter minimum and maximum hourly rates.';
  if (!locum && draft.ftptPayMode === 'ANNUAL' && (!draft.minAnnual || !draft.maxAnnual || !draft.superPercent)) return 'Enter minimum and maximum annual pay and super percentage.';
  return null;
}

export function buildShiftPostingPayload(draft: ShiftPostingDraft): Record<string, unknown> {
  const privateBooking = isPrivateShiftBooking(draft.dedicatedUserId);
  const locum = ['LOCUM','CASUAL'].includes(draft.employmentType);
  const payload: Record<string, unknown> = {
    pharmacy: draft.pharmacyId, role_needed: draft.roleNeeded, employment_type: draft.employmentType, description: draft.description,
    workload_tags: draft.workloadTags, support_on_shift: draft.supportOnShift, must_have: draft.mustHave, nice_to_have: draft.niceToHave,
    visibility: privateBooking ? 'LOCUM_CASUAL' : draft.visibility,
    flexible_timing: draft.flexibleTiming, single_user_only: draft.singleUserOnly,
    post_anonymously: !privateBooking && draft.canPostAnonymously && draft.postAnonymously,
    has_travel: draft.hasTravel, has_accommodation: draft.hasAccommodation, is_urgent: draft.isUrgent,
    rate_type: draft.roleNeeded === 'PHARMACIST' ? draft.rateType : null,
    owner_adjusted_rate: draft.roleNeeded !== 'PHARMACIST' && draft.ownerBonus ? Number(draft.ownerBonus) : null,
    payment_preference: locum ? draft.paymentPreference || null : null,
    slots: buildShiftDraftSlotPayload(draft.slots, draft.expandedSlots, draft.slotRateRows),
  };
  for (const tier of ['LOCUM_CASUAL','OWNER_CHAIN','ORG_CHAIN','PLATFORM']) {
    payload[`escalate_to_${tier.toLowerCase()}`] = privateBooking ? null : draft.escalationDates[tier] || null;
  }
  if (privateBooking) payload.dedicated_user = draft.dedicatedUserId;
  if (locum) payload.super_percent = draft.locumSuperIncluded ? draft.defaultSuperPercent : 0;
  if (draft.roleNeeded === 'PHARMACIST') {
    for (const [field,value] of Object.entries({weekday:draft.rateWeekday,saturday:draft.rateSaturday,sunday:draft.rateSunday,public_holiday:draft.ratePublicHoliday,early_morning:draft.rateEarlyMorning,late_night:draft.rateLateNight})) payload[`rate_${field}`] = value || null;
  }
  if (!draft.editingShiftId) {
    payload.notify_pharmacy_staff = !privateBooking && draft.showNotifyPharmacyStaff && draft.notifyPharmacyStaff;
    payload.notify_favorite_staff = !privateBooking && draft.showNotifyFavoriteStaff && draft.notifyFavoriteStaff;
    payload.notify_chain_members = !privateBooking && draft.showNotifyChainMembers && draft.notifyChainMembers;
  }
  if (!locum) Object.assign(payload, draft.ftptPayMode === 'HOURLY'
    ? {min_hourly_rate:draft.minHourly||null,max_hourly_rate:draft.maxHourly||null,min_annual_salary:null,max_annual_salary:null,super_percent:null}
    : {min_hourly_rate:null,max_hourly_rate:null,min_annual_salary:draft.minAnnual||null,max_annual_salary:draft.maxAnnual||null,super_percent:draft.superPercent||null});
  return payload;
}
