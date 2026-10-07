import type { CurrentUserApi } from '../../contracts/accounts';
/** Domain-owned operations extracted from the established shared API. */
import { API_ENDPOINTS } from '../../constants/endpoints';
import { fetchApi } from '../../transport/application';
import { buildQuery } from '../../utils/serialization';
export function login(credentials: unknown) {
    return fetchApi('/users/login/', { method: 'POST', body: JSON.stringify(credentials) });
}
export type LogoutSessionOptions = {
    refreshToken?: string | null;
    isBrowser?: boolean;
    csrfToken?: string | null;
};
export function logoutSession({ refreshToken = null, isBrowser = false, csrfToken = null }: LogoutSessionOptions = {}) {
    const headers = {
        'Content-Type': 'application/json',
        'X-Client-Platform': isBrowser ? 'web' : 'mobile',
        ...(isBrowser && csrfToken ? { 'X-CSRFToken': csrfToken } : {}),
    };
    return fetchApi('/users/logout/', {
        method: 'POST',
        body: JSON.stringify(isBrowser ? {} : { refresh: refreshToken }),
        headers,
        credentials: isBrowser ? 'include' : 'omit',
        skipAuth: true,
    });
}
export function register(data: unknown) {
    return fetchApi('/users/register/', { method: 'POST', body: JSON.stringify(data) });
}
export function refreshToken(refresh: string) {
    return fetchApi('/users/token/refresh/', { method: 'POST', body: JSON.stringify({ refresh }), skipAuth: true });
}
export function verifyOtp(data: unknown) {
    return fetchApi('/users/verify-otp/', { method: 'POST', body: JSON.stringify(data) });
}
export function resendOtp(data: unknown) {
    return fetchApi('/users/resend-otp/', { method: 'POST', body: JSON.stringify(data) });
}
export function mobileRequestOtp(data: unknown) {
    return fetchApi('/users/mobile/request-otp/', { method: 'POST', body: JSON.stringify(data) });
}
export function mobileVerifyOtp(data: unknown) {
    return fetchApi('/users/mobile/verify-otp/', { method: 'POST', body: JSON.stringify(data) });
}
export function mobileResendOtp(data: unknown) {
    return fetchApi('/users/mobile/resend-otp/', { method: 'POST', body: JSON.stringify(data) });
}
export function deleteAccount() {
    return fetchApi(API_ENDPOINTS.deleteAccount, { method: 'DELETE' });
}
export function getCurrentUser() {
    return fetchApi<CurrentUserApi>('/users/me/');
}
export function passwordReset(email: string) {
    return fetchApi('/users/password-reset/', { method: 'POST', body: JSON.stringify({ email }), skipAuth: true });
}
export function passwordResetConfirm(data: unknown) {
    return fetchApi('/users/password-reset-confirm/', { method: 'POST', body: JSON.stringify(data), skipAuth: true });
}
export function contactSupport(payload: unknown) {
    return fetchApi(API_ENDPOINTS.contactSupport, { method: 'POST', body: JSON.stringify(payload) });
}
export function inviteOrgUser(data: unknown) {
    return fetchApi('/users/invite-org-user/', { method: 'POST', body: JSON.stringify(data) });
}
export function getOrganizationMemberships(params?: Record<string, unknown>) {
    const query = buildQuery(params);
    return fetchApi(`/users/organization-memberships/${query}`);
}
export function updateOrganizationMembership(id: number | string, data: unknown) {
    return fetchApi(`/users/organization-memberships/${id}/`, { method: 'PATCH', body: JSON.stringify(data) });
}
export function deleteOrganizationMembership(id: number | string) {
    return fetchApi(`/users/organization-memberships/${id}/`, { method: 'DELETE' });
}
export function getOrganizationRoleDefinitions() {
    return fetchApi('/users/organization-role-definitions/');
}
export function searchUsers(query: string) {
    return fetchApi(`/users/?search=${encodeURIComponent(query)}`);
}
export function chooseAccountType(
    role: string,
    options: { pharmacy_id?: number | null; staff_role?: string | null } = {},
) {
    return fetchApi<{
        onboarding_url: string;
        role: string;
        staff_role: string;
        pharmacy_id: number;
    }>('/users/me/account-type/', {
        method: 'POST',
        body: JSON.stringify({ role, ...options }),
    });
}
