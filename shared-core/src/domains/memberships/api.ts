import type { MembershipApplicationApi } from '../../types';
import type { MembershipRecordApi, MembershipInviteLinkApi } from '../../contracts/membershipRecords';
import type { Collection } from '../../contracts/common';
/** Domain-owned operations extracted from the established shared API. */
import { fetchApi } from '../../transport/application';
import { buildQuery, camelCaseKeysDeep, fetchAllPages } from '../../utils/serialization';
import { mapMembershipApplication, mapMembershipSummary } from './mappers';
export function getMemberships(params?: Record<string, unknown>) {
    const query = buildQuery(params);
    return fetchApi<Collection<MembershipRecordApi>>(`/memberships/${query}`);
}
export function getMyMemberships(params?: Record<string, unknown>) {
    const query = buildQuery(params);
    return fetchApi<Collection<MembershipRecordApi>>(`/my-memberships/${query}`);
}
export function createMembership(data: unknown) {
    return fetchApi<MembershipRecordApi>('/memberships/', { method: 'POST', body: JSON.stringify(data) });
}
export async function createMembershipInviteService(payload: unknown) {
    const data = await createMembership(payload);
    return mapMembershipSummary(data);
}
export function bulkInviteMembers(data: unknown) {
    return fetchApi('/memberships/bulk_invite/', { method: 'POST', body: JSON.stringify(data) });
}
export async function bulkInviteMembersService(payload: unknown) {
    const data = await bulkInviteMembers(payload);
    return data;
}
export function deleteMembership(id: number | string) {
    return fetchApi(`/memberships/${id}/`, { method: 'DELETE' });
}
export async function deleteMembershipService(membershipId: number | string) {
    await deleteMembership(membershipId);
}
export function getMembershipInviteLinks(params?: Record<string, unknown>) {
    const query = buildQuery(params);
    return fetchApi<Collection<MembershipInviteLinkApi>>(`/membership-invite-links/${query}`);
}
export function createMembershipInviteLink(data: unknown) {
    return fetchApi<MembershipInviteLinkApi>('/membership-invite-links/', { method: 'POST', body: JSON.stringify(data) });
}
export async function createMembershipInviteLinkService(payload: unknown) {
    const data = await createMembershipInviteLink(payload);
    return data;
}
export function getMembershipApplications(params?: Record<string, unknown>) {
    const query = buildQuery(params);
    return fetchApi<Collection<MembershipApplicationApi>>(`/membership-applications/${query}`);
}
export function reviewMembershipApplication(id: number | string, data: unknown) {
    return fetchApi<MembershipApplicationApi>(`/membership-applications/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(data),
    });
}
export function previewMembershipApplicationAward(id: number | string, data: unknown) {
    return fetchApi(`/membership-applications/${id}/award-preview/`, {
        method: 'POST',
        body: JSON.stringify(data),
    });
}
export function approveMembershipApplication(id: number | string, data: unknown) {
    return fetchApi(`/membership-applications/${id}/approve/`, {
        method: 'POST',
        body: JSON.stringify(data),
    });
}
export function rejectMembershipApplication(id: number | string) {
    return fetchApi(`/membership-applications/${id}/reject/`, { method: 'POST' });
}
export function createMembershipInvite(data: unknown) {
    return fetchApi<MembershipRecordApi>('/memberships/', { method: 'POST', body: JSON.stringify(data) });
}
export function getMagicMembershipInfo(token: string) {
    return fetchApi(`/magic/memberships/${token}/`);
}
export function applyMagicMembership(token: string, data: unknown) {
    return fetchApi(`/magic/memberships/${token}/apply/`, { method: 'POST', body: JSON.stringify(data) });
}
export async function fetchMyMemberships(params?: Record<string, unknown>) {
    const list = await fetchAllPages((page) => getMyMemberships({ ...params, page }));
    return list.map(mapMembershipSummary);
}
export async function fetchMembershipsByPharmacy(pharmacyId: number | string) {
    const list = await fetchAllPages((page) => getMemberships({ pharmacy_id: pharmacyId, page }));
    return list.map(mapMembershipSummary);
}
export async function fetchMembershipApplicationsService(params?: Record<string, unknown>) {
    const data = await getMembershipApplications(params);
    const list = Array.isArray(data?.results)
        ? data.results
        : Array.isArray(data)
            ? data
            : [];
    return list.map(item => mapMembershipApplication(item));
}
export async function reviewMembershipApplicationService(applicationId: number | string, payload: unknown) {
    return mapMembershipApplication(await reviewMembershipApplication(applicationId, payload));
}
export async function previewMembershipApplicationAwardService(applicationId: number | string, payload: unknown) {
    return camelCaseKeysDeep(await previewMembershipApplicationAward(applicationId, payload));
}
export async function approveMembershipApplicationService(applicationId: number | string, payload: unknown) {
    return camelCaseKeysDeep(await approveMembershipApplication(applicationId, payload));
}
export async function rejectMembershipApplicationService(applicationId: number | string) {
    await rejectMembershipApplication(applicationId);
}

/** Accepted, rejected and quit membership decisions stay server-owned.
 * Preserve the historical bodyless POST; do not conflate with admin invitations.
 */
export function respondToMyMembership(id: number | string, action: 'accept' | 'reject' | 'quit') {
    return fetchApi(`/my-memberships/${id}/${action}/`, { method: 'POST' });
}
