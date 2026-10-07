import type { OwnerShiftSummaryApi, ShiftApi, ShiftAssignmentApi, ShiftCounterOfferApi, ShiftCounterOfferSlotApi, ShiftInterestApi, ShiftMemberStatusApi, ShiftRatingCommentApi, ShiftRatingSummaryApi, ShiftShareLinkApi, ShiftSlotApi } from '../../types';
/** Domain-owned operations extracted from the established shared API. */
import { camelCaseKeysDeep, ensureArray } from '../../utils/serialization';
const mapShiftSlot = (api: ShiftSlotApi) => camelCaseKeysDeep(api);
const mapShiftAssignment = (api: ShiftAssignmentApi) => camelCaseKeysDeep(api);
const mapShiftCounterOfferSlot = (api: ShiftCounterOfferSlotApi) => camelCaseKeysDeep(api);
export const mapShiftCounterOffer = (api: ShiftCounterOfferApi) => {
    const base = camelCaseKeysDeep(api);
    return {
        ...base,
        slots: ensureArray(api.slots).map(mapShiftCounterOfferSlot),
    };
};
export const mapShiftMemberStatus = (api: ShiftMemberStatusApi) => {
    const base = camelCaseKeysDeep(api);
    const fallbackName = api.name?.trim() ||
        `${api.user_first_name ?? ''} ${api.user_last_name ?? ''}`.trim() ||
        'Candidate';
    return {
        ...base,
        name: fallbackName,
        displayName: fallbackName,
        averageRating: base.averageRating ?? base.rating ?? null,
        rating: base.rating ?? base.averageRating ?? null,
    };
};
export const mapShiftInterest = (api: ShiftInterestApi) => {
    const base = camelCaseKeysDeep(api);
    const displayName = (typeof api.user === 'string' ? api.user : '') ||
        `${api.user_first_name ?? ''} ${api.user_last_name ?? ''}`.trim() ||
        'Candidate';
    const userDetail = camelCaseKeysDeep(api.user_detail);
    const userValue = typeof api.user === 'object' && api.user !== null ? camelCaseKeysDeep(api.user) : displayName;
    return {
        ...base,
        displayName,
        averageRating: base.averageRating ?? base.rating ?? null,
        rating: base.rating ?? base.averageRating ?? null,
        slotId: base.slotId ?? base.slot ?? null,
        user: userValue,
        userDetail,
    };
};
export const mapShiftShareLink = (api: ShiftShareLinkApi) => camelCaseKeysDeep(api);
export const mapShiftRatingSummary = (api: ShiftRatingSummaryApi) => camelCaseKeysDeep(api);
export const mapShiftRatingComment = (api: ShiftRatingCommentApi) => camelCaseKeysDeep(api);
export const mapShift = (api: ShiftApi) => {
    const base = camelCaseKeysDeep(api);
    return {
        ...base,
        slots: ensureArray(api.slots).map(mapShiftSlot),
        slotAssignments: ensureArray(api.slot_assignments).map(mapShiftAssignment),
        allowedEscalationLevels: ensureArray(api.allowed_escalation_levels ?? base.allowedEscalationLevels),
        workloadTags: ensureArray(api.workload_tags ?? base.workloadTags),
        mustHave: ensureArray(api.must_have ?? base.mustHave),
        niceToHave: ensureArray(api.nice_to_have ?? base.niceToHave),
        interestedMembers: ensureArray(api.interested_members).map(mapShiftMemberStatus),
        rejectedMembers: ensureArray(api.rejected_members).map(mapShiftMemberStatus),
        assignedMembers: ensureArray(api.assigned_members).map(mapShiftMemberStatus),
        noResponseMembers: ensureArray(api.no_response_members).map(mapShiftMemberStatus),
        pharmacyDetail: base.pharmacyDetail ?? null,
        flexibleTiming: api.flexible_timing ?? base.flexibleTiming ?? false,
        minHourlyRate: api.min_hourly_rate ?? base.minHourlyRate ?? null,
        maxHourlyRate: api.max_hourly_rate ?? base.maxHourlyRate ?? null,
        minAnnualSalary: api.min_annual_salary ?? base.minAnnualSalary ?? null,
        maxAnnualSalary: api.max_annual_salary ?? base.maxAnnualSalary ?? null,
        superPercent: api.super_percent ?? base.superPercent ?? null,
    };
};
export const mapOwnerShiftSummary = (api: OwnerShiftSummaryApi) => camelCaseKeysDeep(api);
