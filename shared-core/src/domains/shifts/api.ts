import type { ShiftUserApi } from '../../types';
import type { ShiftCounterOfferPayload } from '../../types';
interface SlotSelection {
    shiftId: number;
    slotId?: number | null;
    slotIds?: number[];
}
import type { ShiftApi, ShiftInterestApi, ShiftCounterOfferApi, ShiftOfferApi, ShiftMemberStatusApi, ShiftShareLinkApi, OwnerShiftSummaryApi, ShiftApplicationApi } from '../../types';
import type { Collection } from '../../contracts/common';
/** Domain-owned operations extracted from the established shared API. */
import { API_ENDPOINTS } from '../../constants/endpoints';
import { fetchApi } from '../../transport/application';
import { asList, buildQuery, camelCaseKeysDeep, toPaginatedList } from '../../utils/serialization';
import { mapOwnerShiftSummary, mapShift, mapShiftApplication, mapShiftCounterOffer, mapShiftInterest, mapShiftMemberStatus, mapShiftShareLink } from './mappers';
import type { ShiftOfferAcceptancePayload } from '../../types';
export function calculateShiftRates(payload: unknown) {
    return fetchApi<Array<{
        date?: string;
        rate: string | number;
    }>>('/client-profile/shifts/calculate-rates/', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}
export function getCommunityShifts(params?: Record<string, unknown>) {
    const query = buildQuery(params);
    return fetchApi<Collection<ShiftApi>>(`/client-profile/community-shifts/${query}`);
}
export function getPublicShifts(params?: Record<string, unknown>) {
    const query = buildQuery(params);
    return fetchApi<Collection<ShiftApi>>(`/client-profile/public-shifts/${query}`);
}
export function getActiveShifts() {
    return fetchApi<Collection<ShiftApi>>('/client-profile/shifts/active/');
}
export function getConfirmedShifts() {
    return fetchApi<Collection<ShiftApi>>('/client-profile/shifts/confirmed/');
}
export function getHistoryShifts() {
    return fetchApi<Collection<ShiftApi>>('/client-profile/shifts/history/');
}
export function getMyConfirmedShifts() {
    return fetchApi<Collection<ShiftApi>>('/client-profile/my-confirmed-shifts/');
}
export function getMyHistoryShifts(params?: Record<string, unknown>) {
    const query = buildQuery(params);
    return fetchApi<Collection<ShiftApi>>(`/client-profile/my-history-shifts/${query}`);
}
export function getShiftInterests(params?: Record<string, unknown>) {
    const query = buildQuery(params);
    return fetchApi<Collection<ShiftInterestApi>>(`/client-profile/shift-interests/${query}`);
}
export function getShiftRejections(params?: Record<string, unknown>) {
    const query = buildQuery(params);
    return fetchApi<Collection<ShiftInterestApi>>(`/client-profile/shift-rejections/${query}`);
}
export function getShiftCounterOffers(shiftId: number | string) {
    return fetchApi<Collection<ShiftCounterOfferApi>>(`/client-profile/shifts/${shiftId}/counter-offers/`);
}
export function getShiftCounterOffersBatch(shiftIds: number[]) {
    const ids = Array.from(new Set((shiftIds || []).map(Number).filter(Number.isFinite)));
    if (ids.length === 0)
        return Promise.resolve<Record<string, ShiftCounterOfferApi[]>>({});
    const query = encodeURIComponent(ids.join(','));
    return fetchApi<Record<string, ShiftCounterOfferApi[]>>(`/client-profile/shifts/counter-offers-batch/?shift_ids=${query}`);
}
export function createShiftCounterOffer(shiftId: number | string, data: unknown) {
    return fetchApi<ShiftCounterOfferApi>(`/client-profile/shifts/${shiftId}/counter-offers/`, {
        method: 'POST',
        body: JSON.stringify(data),
    });
}
export function acceptShiftCounterOffer(shiftId: number | string, offerId: number | string, data: {
    slotId?: number | null;
    slot_id?: number | null;
} | undefined) {
    const slotId = data?.slotId ?? data?.slot_id ?? null;
    const query = slotId != null ? `?slot_id=${encodeURIComponent(slotId)}` : '';
    return fetchApi(`/client-profile/shifts/${shiftId}/counter-offers/${offerId}/accept/${query}`, {
        method: 'POST',
        body: slotId != null ? JSON.stringify({ slot_id: slotId }) : undefined,
    });
}
export function rejectShiftCounterOffer(shiftId: number | string, offerId: number | string) {
    return fetchApi(`/client-profile/shifts/${shiftId}/counter-offers/${offerId}/reject/`, { method: 'POST' });
}
export function fetchShiftOffers(query = '') {
    return fetchApi<Collection<ShiftOfferApi>>(`/client-profile/shift-offers/${query}`);
}
export function acceptShiftOffer(offerId: number | string, data: ShiftOfferAcceptancePayload & {
    engagement_terms_accepted?: boolean;
    independent_contractor_status_confirmed?: boolean;
} = {}) {
    const body = {
        engagement_terms_accepted: data?.engagementTermsAccepted ?? data?.engagement_terms_accepted ?? false,
        independent_contractor_status_confirmed: data?.independentContractorStatusConfirmed ?? data?.independent_contractor_status_confirmed ?? false,
    };
    return fetchApi(`/client-profile/shift-offers/${offerId}/accept/`, {
        method: 'POST',
        body: JSON.stringify(body),
    });
}
export function activateShiftOfferPayroll(offerId: number | string) {
    return fetchApi(`/client-profile/shift-offers/${offerId}/activate-payroll/`, { method: 'POST' });
}
export function declineShiftOffer(offerId: number | string) {
    return fetchApi(`/client-profile/shift-offers/${offerId}/decline/`, { method: 'POST' });
}
export function buzzShiftOffer(offerId: number | string) {
    return fetchApi(`/client-profile/shift-offers/${offerId}/buzz/`, { method: 'POST' });
}
export function getCommunityShiftDetail(id: number | string) {
    return fetchApi<ShiftApi>(`/client-profile/community-shifts/${id}`);
}
export function getPublicShiftDetail(id: number | string) {
    return fetchApi<ShiftApi>(`/client-profile/public-shifts/${id}`);
}
export function getActiveShiftDetail(id: number | string) {
    return fetchApi<ShiftApi>(`/client-profile/shifts/active/${id}`);
}
export function deleteActiveShift(id: number | string) {
    return fetchApi(`/client-profile/shifts/active/${id}/`, { method: 'DELETE' });
}
export function getActiveShiftMemberStatus(id: number | string, params?: Record<string, unknown>) {
    const query = buildQuery(params);
    return fetchApi<Collection<ShiftMemberStatusApi>>(`/client-profile/shifts/${id}/member_status/${query}`);
}
export function getConfirmedShiftDetail(id: number | string) {
    return fetchApi<ShiftApi>(`/client-profile/shifts/confirmed/${id}/`);
}
export function getWorkerShiftDetail(id: number | string) {
    return fetchApi<ShiftApi>(`/client-profile/shifts/${id}/`);
}
export function createShift(data: unknown) {
    return fetchApi<ShiftApi>('/client-profile/community-shifts/', { method: 'POST', body: JSON.stringify(data) });
}
export function updateShift(id: number | string, data: unknown) {
    return fetchApi<ShiftApi>(`/client-profile/community-shifts/${id}/`, { method: 'PATCH', body: JSON.stringify(data) });
}
export function deleteShift(id: number | string) {
    return fetchApi(`/client-profile/community-shifts/${id}/`, { method: 'DELETE' });
}
export function claimShift(id: number | string, data: unknown) {
    return fetchApi(`/client-profile/community-shifts/${id}/claim-shift/`, {
        method: 'POST',
        body: JSON.stringify(data ?? {}),
    });
}
export function expressInterestInShift(id: number | string, data: unknown) {
    return fetchApi(`/client-profile/shifts/${id}/express_interest/`, {
        method: 'POST',
        body: JSON.stringify(data ?? {}),
    });
}
export function expressInterestInCommunityShift(id: number | string, data: unknown) {
    return fetchApi(`/client-profile/community-shifts/${id}/express_interest/`, {
        method: 'POST',
        body: JSON.stringify(data ?? {}),
    });
}
export function expressInterestInPublicShift(id: number | string, data: unknown) {
    return fetchApi(`/client-profile/public-shifts/${id}/express_interest/`, {
        method: 'POST',
        body: JSON.stringify(data ?? {}),
    });
}
export function revealProfile(id: number | string, data: unknown) {
    return fetchApi(`/client-profile/shifts/${id}/reveal_profile/`, {
        method: 'POST',
        body: JSON.stringify(data ?? {}),
    });
}
export function acceptUserToShift(id: number | string, data: unknown) {
    return fetchApi(`/client-profile/shifts/${id}/accept_user/`, { method: 'POST', body: JSON.stringify(data) });
}
export function escalateCommunityShift(id: number | string) {
    return fetchApi(`/client-profile/community-shifts/${id}/escalate/`, { method: 'POST' });
}
export function getCommunityShiftMemberStatus(id: number | string, params?: Record<string, unknown>) {
    const query = buildQuery(params);
    return fetchApi<Collection<ShiftMemberStatusApi>>(`/client-profile/community-shifts/${id}/member_status/${query}`);
}
export function rejectCommunityShift(id: number | string, data: unknown) {
    return fetchApi(`/client-profile/community-shifts/${id}/reject/`, {
        method: 'POST',
        body: JSON.stringify(data ?? {}),
    });
}
export function rejectShift(id: number | string, data: unknown) {
    return fetchApi(`/client-profile/shifts/${id}/reject/`, {
        method: 'POST',
        body: JSON.stringify(data ?? {}),
    });
}
export function viewAssignedShiftProfile(type: string, id: number | string, data: unknown) {
    return fetchApi<ShiftUserApi>(`/client-profile/shifts/${type}/${id}/view_assigned_profile/`, {
        method: 'POST',
        body: JSON.stringify(data),
    });
}
export function generateShareLink(id: number | string) {
    return fetchApi<ShiftShareLinkApi>(`/client-profile/shifts/${id}/generate-share-link/`, { method: 'POST' });
}
export function getOwnerShifts(params?: Record<string, unknown>) {
    const query = buildQuery(params);
    return fetchApi<Collection<OwnerShiftSummaryApi>>(`/client-profile/shifts/owner/${query}`);
}
export function createOwnerShift(data: unknown) {
    return fetchApi<ShiftApi>('/client-profile/shifts/', { method: 'POST', body: JSON.stringify(data) });
}
export function updateOwnerShift(id: number | string, data: unknown) {
    return fetchApi<ShiftApi>(`/client-profile/shifts/${id}/`, { method: 'PATCH', body: JSON.stringify(data) });
}
export function getShiftApplications(id: number | string) {
    return fetchApi<Collection<ShiftApplicationApi>>(`/client-profile/shifts/${id}/applications/`);
}
export function acceptShiftApplication(shiftId: number | string, applicationId: number | string) {
    return fetchApi(`/client-profile/shifts/${shiftId}/applications/${applicationId}/accept/`, { method: 'POST' });
}
export function rejectShiftApplication(shiftId: number | string, applicationId: number | string) {
    return fetchApi(`/client-profile/shifts/${shiftId}/applications/${applicationId}/reject/`, { method: 'POST' });
}
export function getPublicJobBoard(params?: {
    organization?: number | string;
}) {
    const query = buildQuery(params);
    return fetchApi<Collection<ShiftApi>>(`/client-profile/public-job-board/${query}`, { skipAuth: true });
}
export function getViewSharedShift(params: Record<string, string>) {
    const query = new URLSearchParams(params).toString();
    return fetchApi(`/client-profile/view-shared-shift/?${query}`, { skipAuth: true });
}
const toInterestParams = (filters?: Record<string, unknown>) => ({
    shift: filters?.shiftId,
    user: filters?.userId,
});
export const toShiftListParams = (filters?: Record<string, unknown>) => ({
    pharmacy: filters?.pharmacyId,
    start_date: filters?.startDate,
    end_date: filters?.endDate,
    unassigned: filters?.unassigned,
    search: filters?.search,
    roles: filters?.roles,
    employment_types: filters?.employmentTypes,
    city: filters?.city,
    state: filters?.state,
    min_rate: filters?.minRate,
    only_urgent: filters?.onlyUrgent,
    negotiable_only: filters?.negotiableOnly,
    flexible_only: filters?.flexibleOnly,
    travel_provided: filters?.travelProvided,
    accommodation_provided: filters?.accommodationProvided,
    bulk_shifts_only: filters?.bulkShiftsOnly,
    time_of_day: filters?.timeOfDay,
    page: filters?.page,
    page_size: filters?.pageSize,
});
const buildSlotPayload = (slotId?: number | string | null, slotIds?: number[]) => {
    if (Array.isArray(slotIds)) {
        return { slot_ids: slotIds };
    }
    if (slotId === undefined) {
        return undefined;
    }
    return { slot_id: slotId };
};
const toOwnerShiftParams = (filters?: Record<string, unknown>) => ({
    pharmacy_id: filters?.pharmacyId,
    status: filters?.status,
});
export async function fetchActiveShifts() {
    const data = await getActiveShifts();
    return asList(data).map(mapShift);
}
export async function fetchActiveShiftDetailService(shiftId: number | string) {
    const data = await getActiveShiftDetail(shiftId);
    return mapShift(data);
}
export async function fetchCommunityShifts(filters?: Record<string, unknown>) {
    const data = await getCommunityShifts(toShiftListParams(filters));
    return toPaginatedList(data, mapShift);
}
export async function fetchCommunityShiftDetailService(shiftId: number | string) {
    const data = await getCommunityShiftDetail(shiftId);
    return mapShift(data);
}
export async function fetchPublicShifts(filters?: Record<string, unknown>) {
    const data = await getPublicShifts(toShiftListParams(filters));
    return toPaginatedList(data, mapShift);
}
export async function fetchPublicShiftDetailService(shiftId: number | string) {
    const data = await getPublicShiftDetail(shiftId);
    return mapShift(data);
}
export async function fetchConfirmedShifts() {
    const data = await getConfirmedShifts();
    return asList(data).map(mapShift);
}
export async function fetchConfirmedShiftDetailService(shiftId: number | string) {
    const data = await getConfirmedShiftDetail(shiftId);
    return mapShift(data);
}
export async function fetchHistoryShifts() {
    const data = await getHistoryShifts();
    return asList(data).map(mapShift);
}
export async function fetchMyConfirmedShifts() {
    const data = await getMyConfirmedShifts();
    return asList(data).map(mapShift);
}
export async function fetchMyHistoryShifts() {
    const data = await getMyHistoryShifts();
    return asList(data).map(mapShift);
}
export async function fetchWorkerShiftDetailService(shiftId: number | string) {
    const data = await getWorkerShiftDetail(shiftId);
    return mapShift(data);
}
export async function fetchPosterShiftDetailService(shiftId: number | string) {
    const data = await getActiveShiftDetail(shiftId);
    return mapShift(data);
}
export async function fetchShiftInterests(filters?: Record<string, unknown>) {
    const data = await getShiftInterests(toInterestParams(filters));
    return asList(data).map(mapShiftInterest);
}
export async function fetchShiftRejections(filters?: Record<string, unknown>) {
    const data = await getShiftRejections(toInterestParams(filters));
    return asList(data).map(mapShiftInterest);
}
export async function fetchSavedShifts() {
    const data = await fetchApi<Collection<{
        id: number;
        shift: number;
    }>>(API_ENDPOINTS.getShiftSaved);
    return asList(data).map(camelCaseKeysDeep);
}
export async function saveShift(shiftId: number | string) {
    const data = await fetchApi<{
        id: number;
        shift: number;
    }>(API_ENDPOINTS.getShiftSaved, {
        method: "POST",
        body: JSON.stringify({ shift: shiftId }),
    });
    return camelCaseKeysDeep(data);
}
export async function deleteSavedShift(savedId: number | string) {
    await fetchApi(`${API_ENDPOINTS.getShiftSaved}${savedId}/`, { method: "DELETE" });
    return true;
}
export async function fetchShiftCounterOffersBatchService(shiftIds: number[]) {
    const data = await getShiftCounterOffersBatch(shiftIds);
    const result: Record<number, ReturnType<typeof mapShiftCounterOffer>[]> = {};
    Object.entries(data || {}).forEach(([shiftId, offers]) => {
        result[Number(shiftId)] = asList(offers).map(mapShiftCounterOffer);
    });
    return result;
}
export async function fetchShiftCounterOffersService(shiftId: number | string) {
    try {
        const data = await getShiftCounterOffers(shiftId);
        return asList(data).map(mapShiftCounterOffer);
    }
    catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err || '');
        if (msg.includes('404') || msg.includes('No Shift matches') || msg.includes('Not Found') || msg.includes('not found')) {
            return [];
        }
        throw err;
    }
}
export async function submitShiftCounterOfferService(payload: ShiftCounterOfferPayload & {
    travel_origin?: string;
}) {
    const body = {
        request_travel: payload.requestTravel ?? false,
        travel_origin_input: payload.travelOrigin ?? payload.travel_origin ?? '',
        slots: (payload.slots || []).map((slot) => ({
            slot_id: slot.slotId,
            // Carry per-occurrence date so recurring shifts capture every instance.
            slot_date: slot.slotDate,
            proposed_start_time: slot.proposedStartTime,
            proposed_end_time: slot.proposedEndTime,
            proposed_rate: slot.proposedRate ?? null,
        })),
    };
    const data = await createShiftCounterOffer(payload.shiftId, body);
    return mapShiftCounterOffer(data);
}
export async function acceptShiftCounterOfferService(payload: {
    shiftId: number;
    offerId: number;
    slotId?: number | null;
}) {
    await acceptShiftCounterOffer(payload.shiftId, payload.offerId, payload);
}
export async function rejectShiftCounterOfferService(payload: {
    shiftId: number;
    offerId: number;
}) {
    await rejectShiftCounterOffer(payload.shiftId, payload.offerId);
}
export async function fetchShiftOffersService(filters?: {
    status?: string;
}) {
    const params = new URLSearchParams();
    if (filters?.status)
        params.set('status', filters.status);
    const query = params.toString();
    const data = await fetchShiftOffers(query ? `?${query}` : '');
    return asList(data).map(camelCaseKeysDeep);
}
export async function acceptShiftOfferService(offerId: number | string, payload: ShiftOfferAcceptancePayload = {}) {
    return camelCaseKeysDeep(await acceptShiftOffer(offerId, payload));
}
export async function activateShiftOfferPayrollService(offerId: number | string) {
    return camelCaseKeysDeep(await activateShiftOfferPayroll(offerId));
}
export async function declineShiftOfferService(offerId: number | string) {
    await declineShiftOffer(offerId);
}
export async function buzzShiftOfferService(offerId: number | string) {
    return camelCaseKeysDeep(await buzzShiftOffer(offerId));
}
export async function fetchShiftMemberStatus(shiftId: number | string, options?: Record<string, unknown>) {
    const params = {
        slot_id: options?.slotId,
        visibility: options?.visibility,
    };
    const data = await getActiveShiftMemberStatus(shiftId, params);
    return asList(data).map(mapShiftMemberStatus);
}
export async function generateShiftShareLinkService(shiftId: number | string) {
    const data = await generateShareLink(shiftId);
    return mapShiftShareLink(data);
}
export async function escalateShiftService(shiftId: number | string, payload: {
    targetVisibility?: string;
}) {
    await fetchApi(`/client-profile/shifts/active/${shiftId}/escalate/`, {
        method: 'POST',
        body: JSON.stringify({ target_visibility: payload.targetVisibility }),
    });
}
export async function deleteActiveShiftService(shiftId: number | string) {
    await deleteActiveShift(shiftId);
}
export async function acceptShiftCandidateService(shiftId: number | string, payload: {
    userId: number;
    slotId?: number | null;
}) {
    const data = await acceptUserToShift(shiftId, { user_id: payload.userId, slot_id: payload.slotId });
    return camelCaseKeysDeep(data);
}
export async function revealShiftInterestService(shiftId: number | string, payload: {
    userId: number;
    slotId?: number | null;
}) {
    const data = await revealProfile(shiftId, { user_id: payload.userId, slot_id: payload.slotId });
    return camelCaseKeysDeep(data);
}
export async function expressInterestInCommunityShiftService(params: SlotSelection) {
    await expressInterestInCommunityShift(params.shiftId, buildSlotPayload(params.slotId, params.slotIds));
}
export async function expressInterestInPublicShiftService(params: SlotSelection) {
    await expressInterestInPublicShift(params.shiftId, buildSlotPayload(params.slotId, params.slotIds));
}
export async function expressInterestInShiftService(params: SlotSelection) {
    await expressInterestInShift(params.shiftId, buildSlotPayload(params.slotId, params.slotIds));
}
export async function rejectCommunityShiftService(params: SlotSelection) {
    await rejectCommunityShift(params.shiftId, buildSlotPayload(params.slotId, params.slotIds));
}
export async function rejectShiftService(params: SlotSelection) {
    await rejectShift(params.shiftId, buildSlotPayload(params.slotId, params.slotIds));
}
export async function claimShiftService(params: SlotSelection) {
    await claimShift(params.shiftId, buildSlotPayload(params.slotId));
}
export async function viewAssignedShiftProfileService(params: SlotSelection & {
    type: 'confirmed' | 'history';
    userId: number;
}) {
    const data = await viewAssignedShiftProfile(params.type, params.shiftId, {
        user_id: params.userId,
        slot_id: params.slotId,
    });
    return camelCaseKeysDeep(data);
}
export async function fetchOwnerShiftsService(filters?: Record<string, unknown>) {
    const data = await getOwnerShifts(toOwnerShiftParams(filters));
    return asList(data).map(mapOwnerShiftSummary);
}
export async function createOwnerShiftService(payload: unknown) {
    await createOwnerShift(payload);
}
export async function updateOwnerShiftService(shiftId: number | string, payload: unknown) {
    await updateOwnerShift(shiftId, payload);
}
export async function fetchShiftApplicationsService(shiftId: number | string) {
    const data = await getShiftApplications(shiftId);
    return asList(data).map(mapShiftApplication);
}
export async function acceptShiftApplicationService(shiftId: number | string, applicationId: number | string) {
    await acceptShiftApplication(shiftId, applicationId);
}
export async function rejectShiftApplicationService(shiftId: number | string, applicationId: number | string) {
    await rejectShiftApplication(shiftId, applicationId);
}
