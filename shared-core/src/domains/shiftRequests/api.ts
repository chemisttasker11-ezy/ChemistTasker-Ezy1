import type { LeaveRequestApi, WorkerShiftRequestApi } from '../../types';
import type { Collection } from '../../contracts/common';
/** Domain-owned operations extracted from the established shared API. */
import { fetchApi } from '../../transport/application';
import { buildQuery, camelCaseKeysDeep } from '../../utils/serialization';
export function getLeaveRequests() {
    return fetchApi<Collection<LeaveRequestApi>>('/client-profile/leave-requests/');
}
export function createLeaveRequest(data: unknown) {
    return fetchApi('/client-profile/leave-requests/', { method: 'POST', body: JSON.stringify(data) });
}
export function updateLeaveRequest(id: number | string, data: unknown) {
    return fetchApi(`/client-profile/leave-requests/${id}/`, { method: 'PATCH', body: JSON.stringify(data) });
}
export function approveLeaveRequest(id: number | string) {
    return fetchApi(`/client-profile/leave-requests/${id}/approve/`, { method: 'POST' });
}
export function rejectLeaveRequest(id: number | string) {
    return fetchApi(`/client-profile/leave-requests/${id}/reject/`, { method: 'POST' });
}
export function deleteLeaveRequest(id: number | string) {
    return fetchApi(`/client-profile/leave-requests/${id}/`, { method: 'DELETE' });
}
export function getWorkerShiftRequests(params?: Record<string, unknown>) {
    const query = buildQuery(params);
    return fetchApi<Collection<WorkerShiftRequestApi>>(`/client-profile/worker-shift-requests/${query}`);
}
export function createWorkerShiftRequest(data: unknown) {
    return fetchApi<WorkerShiftRequestApi>('/client-profile/worker-shift-requests/', { method: 'POST', body: JSON.stringify(data) });
}
export function updateWorkerShiftRequest(id: number | string, data: unknown) {
    return fetchApi(`/client-profile/worker-shift-requests/${id}/`, { method: 'PATCH', body: JSON.stringify(data) });
}
export function approveWorkerShiftRequest(id: number | string) {
    return fetchApi(`/client-profile/worker-shift-requests/${id}/approve/`, { method: 'POST' });
}
export function rejectWorkerShiftRequest(id: number | string) {
    return fetchApi(`/client-profile/worker-shift-requests/${id}/reject/`, { method: 'POST' });
}
export function deleteWorkerShiftRequest(id: number | string) {
    return fetchApi(`/client-profile/worker-shift-requests/${id}/`, { method: 'DELETE' });
}
export async function createLeaveRequestService(payload: unknown) {
    const data = await createLeaveRequest(payload);
    return camelCaseKeysDeep(data);
}
export async function updateLeaveRequestService(leaveId: number | string, payload: unknown) {
    const data = await updateLeaveRequest(leaveId, payload);
    return camelCaseKeysDeep(data);
}
export async function deleteLeaveRequestService(leaveId: number | string) {
    await deleteLeaveRequest(leaveId);
}
export async function approveLeaveRequestService(leaveId: number | string) {
    await approveLeaveRequest(leaveId);
}
export async function rejectLeaveRequestService(leaveId: number | string) {
    await rejectLeaveRequest(leaveId);
}
export async function createWorkerShiftRequestService(payload: unknown) {
    const data = await createWorkerShiftRequest(payload);
    return camelCaseKeysDeep(data);
}
export async function updateWorkerShiftRequestService(requestId: number | string, payload: unknown) {
    const data = await updateWorkerShiftRequest(requestId, payload);
    return camelCaseKeysDeep(data);
}
export async function deleteWorkerShiftRequestService(requestId: number | string) {
    await deleteWorkerShiftRequest(requestId);
}
export async function approveWorkerShiftRequestService(requestId: number | string) {
    await approveWorkerShiftRequest(requestId);
}
export async function rejectWorkerShiftRequestService(requestId: number | string) {
    await rejectWorkerShiftRequest(requestId);
}
