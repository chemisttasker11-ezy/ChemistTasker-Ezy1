import type { RosterPeriod } from '../../contracts/attendanceRoster';
import type { PharmacyApi } from '../../contracts/organizations';
import type { RosterAssignmentApi, OpenShiftApi, RosterPharmacyMemberApi } from '../../types';
import type { Collection } from '../../contracts/common';
/** Domain-owned operations extracted from the established shared API. */
import { API_ENDPOINTS } from '../../constants/endpoints';
import { fetchApi } from '../../transport/application';
import { operationalRequest } from '../../transport/operational';
import { asList, buildQuery } from '../../utils/serialization';
import { mapPharmacySummaryRecord } from '../organizations/mappers';
import { getWorkerShiftRequests } from '../shiftRequests/api';
import { toShiftListParams } from '../shifts/api';
import { mapOpenShift, mapRosterAssignment, mapRosterPharmacyMember, mapWorkerShiftRequest } from './mappers';
import type { RosterPharmacyMember, WorkerShiftRequest } from '../../types';
import type { RosterPublicationResult, RosterPublishCommand, RosterValidateCommand, RosterValidationResult } from '../rosterPublication';
export const rosterV2 = {
    getPeriod: (pharmacyId: number | string, weekStart: string) => operationalRequest<RosterPeriod>(API_ENDPOINTS.rosterV2.period, { query: { pharmacy_id: pharmacyId, week_start: weekStart } }),
    initializePeriod: (pharmacyId: number | string, weekStart: string) => operationalRequest<RosterPeriod>(API_ENDPOINTS.rosterV2.period, { method: 'POST', body: { pharmacy_id: pharmacyId, week_start: weekStart } }),
    validate: (body: RosterValidateCommand): Promise<RosterValidationResult> => operationalRequest(API_ENDPOINTS.workforce.rosterValidate, { method: 'POST', body }),
    publish: (body: RosterPublishCommand): Promise<RosterPublicationResult> => operationalRequest(API_ENDPOINTS.workforce.rosterPublish, { method: 'POST', body }),
    unpublish: (body: unknown) => operationalRequest(API_ENDPOINTS.rosterV2.unpublish, { method: 'POST', body }),
    archive: (body: unknown) => operationalRequest(API_ENDPOINTS.rosterV2.archive, { method: 'POST', body }),
    getWorkerRoster: (query: Record<string, unknown>) => operationalRequest(API_ENDPOINTS.rosterV2.worker, { query }),
    acknowledge: (body: unknown) => operationalRequest(API_ENDPOINTS.rosterV2.acknowledge, { method: 'POST', body }),
    getAcknowledgements: (periodId: number | string) => operationalRequest(API_ENDPOINTS.rosterV2.acknowledgements(periodId)),
    copyWeek: (body: unknown) => operationalRequest(API_ENDPOINTS.rosterV2.copyWeek, { method: 'POST', body }),
    getTemplates: (pharmacyId: number | string) => operationalRequest(API_ENDPOINTS.rosterV2.templates, { query: { pharmacy_id: pharmacyId } }),
    createTemplate: (body: unknown) => operationalRequest(API_ENDPOINTS.rosterV2.templates, { method: 'POST', body }),
    applyTemplate: (body: unknown) => operationalRequest(API_ENDPOINTS.rosterV2.templateApply, { method: 'POST', body }),
    bulkEdit: (periodId: number | string, operations: Record<string, unknown>[]) => operationalRequest(API_ENDPOINTS.rosterV2.bulkEdit, { method: 'POST', body: { period_id: periodId, operations } }),
    unpublishShift: (slotId: number | string) => operationalRequest(API_ENDPOINTS.rosterV2.shiftUnpublish, { method: 'POST', body: { slot_id: slotId } }),
    republishShift: (slotId: number | string, notify: 'worker' | 'team' | 'none' = 'worker') => operationalRequest(API_ENDPOINTS.rosterV2.shiftRepublish, { method: 'POST', body: { slot_id: slotId, notify } }),
    requestSwap: (assignmentId: number | string, targetUserId: number | string, notes = '') => operationalRequest(API_ENDPOINTS.rosterV2.workerSwapRequest, { method: 'POST', body: { assignment_id: assignmentId, target_user_id: targetUserId, notes } }),
    requestCover: (assignmentId: number | string, reason = '') => operationalRequest(API_ENDPOINTS.rosterV2.workerCoverRequest, { method: 'POST', body: { assignment_id: assignmentId, reason } }),
    approveSwap: (requestId: number | string, targetUserId?: number | string) => operationalRequest(API_ENDPOINTS.rosterV2.managerApproveSwap, { method: 'POST', body: { request_id: requestId, ...(targetUserId ? { target_user_id: targetUserId } : {}) } }),
    approveReplacement: (requestId: number | string, replacementUserId: number | string) => operationalRequest(API_ENDPOINTS.rosterV2.managerApproveReplacement, { method: 'POST', body: { request_id: requestId, replacement_user_id: replacementUserId } }),
    releaseWorker: (requestId: number | string, escalateToVisibility?: string | null) => operationalRequest(API_ENDPOINTS.rosterV2.managerReleaseWorker, { method: 'POST', body: { request_id: requestId, escalate_to_visibility: escalateToVisibility ?? null } }),
    rejectRequest: (requestId: number | string, reason = '') => operationalRequest(API_ENDPOINTS.rosterV2.managerRejectRequest, { method: 'POST', body: { request_id: requestId, reason } }),
    getAudits: (pharmacyId: number | string) => operationalRequest(API_ENDPOINTS.rosterV2.audits, { query: { pharmacy_id: pharmacyId } }),
};
const toRosterQueryParams = (filters?: Record<string, unknown>) => ({
    pharmacy: filters?.pharmacyId,
    start_date: filters?.startDate,
    end_date: filters?.endDate,
});
export function getRosterOwner(params?: Record<string, unknown>) {
    const query = buildQuery(params);
    return fetchApi<Collection<RosterAssignmentApi>>(`/roster-owner/${query}`);
}
export function getRosterWorker(params?: Record<string, unknown>) {
    const query = buildQuery(params);
    return fetchApi<Collection<RosterAssignmentApi>>(`/roster-worker/${query}`);
}
export function createShiftAndAssign(data: unknown) {
    return fetchApi('/roster/create-and-assign-shift/', { method: 'POST', body: JSON.stringify(data) });
}
export function updateRosterShift(id: number | string, data: unknown) {
    return fetchApi(`/roster-shifts/${id}/`, { method: 'PATCH', body: JSON.stringify(data) });
}
export function deleteRosterShift(id: number | string) {
    return fetchApi(`/roster-shifts/${id}/`, { method: 'DELETE' });
}
export function escalateRosterShift(id: number | string, data: unknown) {
    const options: {
        method: string;
        body?: string;
    } = { method: 'POST' };
    if (data) {
        options.body = JSON.stringify(data);
    }
    return fetchApi(`/roster-shifts/${id}/escalate/`, options);
}
export function getOwnerOpenShifts(params?: Record<string, unknown>) {
    const query = buildQuery(params);
    return fetchApi<Collection<OpenShiftApi>>(`/roster-shifts/list-open-shifts/${query}`);
}
export function createOpenShift(data: unknown) {
    return fetchApi('/roster-shifts/create-open-shift/', { method: 'POST', body: JSON.stringify(data) });
}
export function deleteRosterAssignment(id: number | string) {
    return fetchApi(`/roster-owner/${id}/`, { method: 'DELETE' });
}
export function getRosterOwnerMembers(pharmacyId: number | string, role: string | null = null) {
    const query = buildQuery({ pharmacy_id: pharmacyId, ...(role ? { role } : {}) });
    return fetchApi<Collection<RosterPharmacyMemberApi>>(`/roster-owner/members-for-roster/${query}`);
}
export function getRosterWorkerPharmacies() {
    return fetchApi<Collection<PharmacyApi>>('/roster-worker/pharmacies/');
}
export async function fetchRosterOwnerAssignments(params?: Record<string, unknown>) {
    const data = await getRosterOwner(toRosterQueryParams(params));
    return asList(data).map(mapRosterAssignment);
}
export async function fetchRosterWorkerAssignments(params?: Record<string, unknown>) {
    const data = await getRosterWorker(toRosterQueryParams(params));
    return asList(data).map(mapRosterAssignment);
}
export async function fetchWorkerShiftRequestsService(params?: Record<string, unknown>): Promise<WorkerShiftRequest[]> {
    const data = await getWorkerShiftRequests(toRosterQueryParams(params));
    return asList(data).map(mapWorkerShiftRequest);
}
export async function fetchOwnerOpenShifts(params?: Record<string, unknown>) {
    const data = await getOwnerOpenShifts(toShiftListParams(params));
    return asList(data).map(mapOpenShift);
}
export async function fetchRosterOwnerMembersService(pharmacyId: number | string, role: string | null = null): Promise<RosterPharmacyMember[]> {
    const data = await getRosterOwnerMembers(pharmacyId, role);
    return asList(data).map(mapRosterPharmacyMember);
}
export async function fetchRosterWorkerPharmaciesService() {
    const data = await getRosterWorkerPharmacies();
    return asList(data).map(mapPharmacySummaryRecord);
}
export async function createShiftAndAssignService(payload: unknown) {
    await createShiftAndAssign(payload);
}
export async function updateRosterShiftService(shiftId: number | string, payload: unknown) {
    await updateRosterShift(shiftId, payload);
}
export async function deleteRosterShiftService(shiftId: number | string) {
    await deleteRosterShift(shiftId);
}
export async function escalateRosterShiftService(shiftId: number | string, payload: unknown) {
    await escalateRosterShift(shiftId, payload);
}
export async function deleteRosterAssignmentService(assignmentId: number | string) {
    await deleteRosterAssignment(assignmentId);
}
export async function createOpenShiftService(payload: unknown) {
    await createOpenShift(payload);
}
