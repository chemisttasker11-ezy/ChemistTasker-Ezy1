import type { PharmacyAdminInvitationApi } from '../../contracts/organizations';
import type { ChainApi } from '../../types';
import type { OrganizationApi, PharmacyApi, PharmacyClaimApi, PharmacyAdminApi } from '../../contracts/organizations';
import type { Collection } from '../../contracts/common';
/** Domain-owned operations extracted from the established shared API. */
import { fetchApi } from '../../transport/application';
import { asList, buildQuery } from '../../utils/serialization';
import { mapChain, mapPharmacySummaryRecord } from './mappers';
export function claimOnboarding(data: unknown) {
    return fetchApi('/owner-onboarding/claim/', { method: 'POST', body: JSON.stringify(data) });
}
export function getOrganizations() {
    return fetchApi<Collection<OrganizationApi>>('/organizations/');
}
export function getOrganizationById(id: number | string) {
    return fetchApi<OrganizationApi>(`/organizations/${id}/`);
}
export function createOrganization(data: unknown) {
    return fetchApi<OrganizationApi>('/organizations/', { method: 'POST', body: JSON.stringify(data) });
}
export function getPharmacies(params?: Record<string, unknown>) {
    const query = buildQuery(params);
    return fetchApi<Collection<PharmacyApi>>(`/pharmacies/${query}`);
}
export async function fetchPharmaciesService(params?: Record<string, unknown>) {
    const data = await getPharmacies(params);
    return asList(data).map(mapPharmacySummaryRecord);
}
export async function fetchAccessibleOrganizationPharmacies(organizationId: number | string) {
    const id = Number(organizationId);
    if (!Number.isInteger(id) || id <= 0)
        return [];
    const pharmacies = [];
    let page = 1;
    while (true) {
        const data = await getPharmacies({ page });
        const rows = asList(data);
        pharmacies.push(...rows
            .filter((pharmacy) => Number(pharmacy?.organization) === id)
            .map((pharmacy) => ({ id: Number(pharmacy.id), name: pharmacy.name }))
            .filter((pharmacy) => Number.isInteger(pharmacy.id) && pharmacy.id > 0));
        if (!data?.next)
            break;
        page += 1;
    }
    return pharmacies;
}
export async function fetchChainsService() {
    const data = await getChains();
    return asList(data).map(mapChain);
}
export async function fetchChainDetailService(chainId: number | string) {
    const data = await getChainDetail(chainId);
    return mapChain(data);
}
export async function createChainService(formData: FormData) {
    const data = await createChain(formData);
    return mapChain(data);
}
export async function updateChainService(chainId: number | string, formData: FormData) {
    const data = await updateChain(chainId, formData);
    return mapChain(data);
}
export async function deleteChainService(chainId: number | string) {
    await deleteChain(chainId);
}
export async function fetchChainPharmaciesService(chainId: number | string) {
    const data = await getChainPharmacies(chainId);
    return asList(data).map(mapPharmacySummaryRecord);
}
export function getPharmacyById(id: number | string) {
    return fetchApi<PharmacyApi>(`/pharmacies/${id}/`);
}
export function createPharmacy(data: unknown) {
    const body = data instanceof FormData ? data : JSON.stringify(data);
    return fetchApi<PharmacyApi>('/pharmacies/', { method: 'POST', body });
}
export function updatePharmacy(id: number | string, data: unknown) {
    const body = data instanceof FormData ? data : JSON.stringify(data);
    return fetchApi<PharmacyApi>(`/pharmacies/${id}/`, { method: 'PATCH', body });
}
export function lookupPharmacyAbn(data: unknown) {
    return fetchApi<Partial<PharmacyApi>>('/pharmacies/lookup-abn/', { method: 'POST', body: JSON.stringify(data) });
}
export function deletePharmacy(id: number | string) {
    return fetchApi(`/pharmacies/${id}/`, { method: 'DELETE' });
}
export function getPharmacyClaims(params?: Record<string, unknown>) {
    const query = buildQuery(params);
    return fetchApi<Collection<PharmacyClaimApi>>(`/pharmacy-claims/${query}`);
}
export function getPharmacyClaimDetail(id: number | string) {
    return fetchApi<PharmacyClaimApi>(`/pharmacy-claims/${id}/`);
}
export function approvePharmacyClaim(id: number | string) {
    return fetchApi<PharmacyClaimApi>(`/pharmacy-claims/${id}/approve/`, { method: 'POST' });
}
export function updatePharmacyClaim(id: number | string, data: unknown) {
    return fetchApi<PharmacyClaimApi>(`/pharmacy-claims/${id}/`, { method: 'PATCH', body: JSON.stringify(data) });
}
export function getPharmacyAdmins(params?: Record<string, unknown>) {
    const query = buildQuery(params);
    return fetchApi<Collection<PharmacyAdminApi>>(`/pharmacy-admins/${query}`);
}
export function getPharmacyAdminDetail(id: number | string) {
    return fetchApi<PharmacyAdminApi>(`/pharmacy-admins/${id}/`);
}
export function createPharmacyAdmin(data: unknown) {
    return fetchApi<PharmacyAdminApi>('/pharmacy-admins/', { method: 'POST', body: JSON.stringify(data) });
}
export function deletePharmacyAdmin(id: number | string) {
    return fetchApi(`/pharmacy-admins/${id}/`, { method: 'DELETE' });
}
export async function fetchPharmacyAdminsService(params?: Record<string, unknown>) {
    const data = await getPharmacyAdmins(params);
    const list = Array.isArray(data?.results)
        ? data.results
        : Array.isArray(data)
            ? data
            : [];
    return list;
}
export async function createPharmacyAdminService(payload: unknown) {
    const data = await createPharmacyAdmin(payload);
    return data;
}
export async function deletePharmacyAdminService(id: number | string) {
    await deletePharmacyAdmin(id);
}
export function getPendingPharmacyAdminInvitations() {
    return fetchApi<PharmacyAdminInvitationApi[]>('/pharmacy-admins/my-pending-invitations/');
}
export function respondToPharmacyAdminInvitation(id: number | string, accept: boolean) {
    const action = accept ? 'accept-invitation' : 'reject-invitation';
    return fetchApi(`/pharmacy-admins/${id}/${action}/`, { method: 'POST' });
}
export function getChains() {
    return fetchApi<Collection<ChainApi>>('/chains/');
}
export function getChainDetail(id: number | string) {
    return fetchApi<ChainApi>(`/chains/${id}/`);
}
export function createChain(data: FormData | Record<string, unknown>) {
    return fetchApi<ChainApi>('/chains/', { method: 'POST', body: data });
}
export function updateChain(id: number | string, data: FormData | Record<string, unknown>) {
    return fetchApi<ChainApi>(`/chains/${id}/`, { method: 'PUT', body: data });
}
export function deleteChain(id: number | string) {
    return fetchApi(`/chains/${id}/`, { method: 'DELETE' });
}
export function getChainPharmacies(id: number | string) {
    return fetchApi<Collection<PharmacyApi>>(`/chains/${id}/pharmacies/`);
}
export function addPharmacyToChain(chainId: number | string, pharmacyId: number | string) {
    return fetchApi(`/chains/${chainId}/add_pharmacy/`, { method: 'POST', body: JSON.stringify({ pharmacy_id: pharmacyId }) });
}
export function removePharmacyFromChain(chainId: number | string, pharmacyId: number | string) {
    return fetchApi(`/chains/${chainId}/remove_pharmacy/`, { method: 'POST', body: JSON.stringify({ pharmacy_id: pharmacyId }) });
}
export function addUserToChain(chainId: number | string, userId: number | string) {
    return fetchApi(`/chains/${chainId}/add_user/`, { method: 'POST', body: JSON.stringify({ user_id: userId }) });
}
export function getPublicOrganization(slug: string) {
    return fetchApi(`/organizations/public/${slug}/`, { skipAuth: true });
}
