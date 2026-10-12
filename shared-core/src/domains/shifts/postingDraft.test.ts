import { describe, expect, it } from 'vitest';
import { buildShiftPostingPayload, buildShiftPostingPreview, validateShiftPostingDraft, SUPER_GUARANTEE_PERCENT, type ShiftPostingDraft } from './postingDraft';
import { expandShiftDraftSlots } from './draftSlots';
const draft = (): ShiftPostingDraft => ({
  pharmacyId:1, roleNeeded:'PHARMACIST', employmentType:'LOCUM', description:'Review draft',
  workloadTags:[], supportOnShift:[], mustHave:[], niceToHave:[], visibility:'PLATFORM',
  escalationDates:{PLATFORM:'2026-10-19T00:00:00Z'}, dedicatedUserId:null, editingShiftId:null,
  flexibleTiming:true, singleUserOnly:false, postAnonymously:true, canPostAnonymously:true,
  hasTravel:true, hasAccommodation:true, isUrgent:true,
  slots:[{date:'2026-10-19',startTime:'09:00',endTime:'17:00',isRecurring:false,recurringDays:[],recurringEndDate:''}],
  expandedSlots:[], slotRateRows:[{rate:'90'}], rateType:'FIXED', ownerBonus:'', paymentPreference:'ABN',
  locumSuperIncluded:false, rateWeekday:'65', rateSaturday:'70', rateSunday:'80',
  ratePublicHoliday:'100', rateEarlyMorning:'', rateLateNight:'', ftptPayMode:'HOURLY',
  minHourly:'', maxHourly:'', minAnnual:'', maxAnnual:'', superPercent:'',
  showNotifyPharmacyStaff:true, showNotifyFavoriteStaff:true, showNotifyChainMembers:true,
  notifyPharmacyStaff:true, notifyFavoriteStaff:true, notifyChainMembers:true,
});
describe('shared posting payload', () => {
  it('keeps the date override above the pharmacy guide and carries extras to every host', () => {
    const input=draft(); input.expandedSlots=expandShiftDraftSlots(input.slots);
    expect(buildShiftPostingPayload(input)).toMatchObject({rate_weekday:'65',slots:[{rate:'90.00'}],has_travel:true,has_accommodation:true,is_urgent:true,flexible_timing:true});
  });
  it('makes dedicated bookings private independently of host embedding', () => {
    const input={...draft(),dedicatedUserId:7};
    expect(buildShiftPostingPayload(input)).toMatchObject({dedicated_user:7,visibility:'LOCUM_CASUAL',post_anonymously:false,notify_pharmacy_staff:false,notify_favorite_staff:false,notify_chain_members:false,escalate_to_platform:null});
  });
  it('never replays notification commands on an edit or an unavailable chain', () => {
    expect(buildShiftPostingPayload({...draft(),editingShiftId:4})).not.toHaveProperty('notify_pharmacy_staff');
    expect(buildShiftPostingPayload({...draft(),showNotifyChainMembers:false})).toHaveProperty('notify_chain_members',false);
  });
  it('switches salary contracts without stale hourly or locum terms', () => {
    expect(buildShiftPostingPayload({...draft(),employmentType:'FULL_TIME',ftptPayMode:'ANNUAL',minAnnual:'80000',maxAnnual:'100000',superPercent:'12'})).toMatchObject({min_hourly_rate:null,max_hourly_rate:null,min_annual_salary:'80000',max_annual_salary:'100000',super_percent:'12',payment_preference:null});
    expect(validateShiftPostingDraft({...draft(),slots:[]})).toBe('Add at least one date before posting.');
  });
  it('adds super at the current guarantee rate when a locum post includes it', () => {
    expect(SUPER_GUARANTEE_PERCENT).toBe(12);
    expect(buildShiftPostingPayload({...draft(),locumSuperIncluded:true})).toHaveProperty('super_percent',12);
  });
  it('previews every concrete date of a weekly repeat, not only the recurrence base', () => {
    const input={...draft(),slots:[{date:'2026-10-19',startTime:'09:00',endTime:'17:00',isRecurring:true,recurringDays:[1],recurringEndDate:'2026-11-02'}],slotRateRows:[]};
    input.expandedSlots=expandShiftDraftSlots(input.slots);
    expect(buildShiftPostingPayload(input).slots).toHaveLength(1);
    const preview=buildShiftPostingPreview(input,{name:'Test Pharmacy'});
    expect(preview.slots.map((slot:any)=>[slot.id,slot.date])).toEqual([[1,'2026-10-19'],[2,'2026-10-26'],[3,'2026-11-02']]);
    expect(preview.pharmacyDetail).toEqual({name:'Test Pharmacy'});
  });
});
