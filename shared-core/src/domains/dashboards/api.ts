/** Domain-owned operations extracted from the established shared API. */
import { fetchApi } from '../../transport/application';
import { buildQuery } from '../../utils/serialization';
export function getOrganizationDashboard(orgId: number | string, params?: Record<string, unknown>) {
    const query = buildQuery(params);
    return fetchApi(`/dashboard/organization/${orgId}/${query}`);
}
export function getOwnerDashboard(params?: Record<string, unknown>) {
    const query = buildQuery(params);
    return fetchApi(`/dashboard/owner/${query}`);
}
export function getPharmacistDashboard(params?: Record<string, unknown>) {
    const query = buildQuery(params);
    return fetchApi(`/dashboard/pharmacist/${query}`);
}
export function getOtherStaffDashboard(params?: Record<string, unknown>) {
    const query = buildQuery(params);
    return fetchApi(`/dashboard/otherstaff/${query}`);
}
export function getExplorerDashboard() {
    return fetchApi('/dashboard/explorer/');
}
