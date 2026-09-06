// @ts-nocheck
/**
 * Shared-Core API Client
 * Complete API functions for ChemistTasker
 */
import { API_ENDPOINTS } from './constants/endpoints';
let config = null;
export function configureApi(apiConfig) {
    config = apiConfig;
}
function getApiConfig() {
    if (!config) {
        throw new Error('API not configured. Call configureApi() first.');
    }
    return config;
}
function buildRequestUrl(baseURL, endpoint) {
    const normalizedBase = baseURL.endsWith('/') ? baseURL : `${baseURL}/`;
    const target = String(endpoint || '');
    if (/^https?:\/\//i.test(target)) {
        return new URL(target);
    }
    return new URL(target.replace(/^\/+/, ''), normalizedBase);
}
function isSameOriginRequest(baseURL, targetUrl) {
    return buildRequestUrl(baseURL, '').origin === targetUrl.origin;
}
async function parseApiError(response) {
    if (response.status >= 500) {
        return `Request failed with status ${response.status}`;
    }
    const payload = await response.json().catch(() => null);
    if (typeof payload === 'string' && payload.trim()) {
        return payload;
    }
    if (Array.isArray(payload) && typeof payload[0] === 'string') {
        return payload[0];
    }
    if (payload && typeof payload === 'object') {
        const extractMessage = (value) => {
            if (!value) return null;
            if (typeof value === 'string' && value.trim()) return value;
            if (Array.isArray(value)) {
                for (const item of value) {
                    const nested = extractMessage(item);
                    if (nested) return nested;
                }
                return null;
            }
            if (typeof value === 'object') {
                for (const nestedValue of Object.values(value)) {
                    const nested = extractMessage(nestedValue);
                    if (nested) return nested;
                }
            }
            return null;
        };
        const detail = extractMessage(payload.detail);
        const error = extractMessage(payload.error);
        const message = extractMessage(payload.message);
        const firstFieldError = Object.values(payload).map(extractMessage).find(Boolean);
        if (detail) return detail;
        if (error) return error;
        if (message) return message;
        if (firstFieldError) {
            return firstFieldError;
        }
    }
    return `Request failed with status ${response.status}`;
}
async function fetchApi(endpoint, options = {}) {
    const { baseURL, getToken, credentials = 'include' } = getApiConfig();
    const includeAuth = !options.skipAuth;
    // Remove the marker so it isn't sent as a header
    if ('skipAuth' in options) {
        delete options.skipAuth;
    }
    const body = options.body;
    if (body && !(body instanceof FormData) && typeof body !== 'string') {
        options.body = JSON.stringify(body);
    }
    const token = includeAuth ? await getToken() : null;
    const headers = {};
    if (options.headers) {
        const existingHeaders = options.headers;
        Object.assign(headers, existingHeaders);
    }
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    if (!(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }
    const response = await fetch(buildRequestUrl(baseURL, endpoint), {
        ...options,
        headers,
        credentials,
    });
    if (!response.ok) {
        throw new Error(await parseApiError(response));
    }
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
        return {};
    }
    return response.json();
}
function buildQuery(params) {
    if (!params)
        return '';
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null) {
            return;
        }
        if (Array.isArray(value)) {
            value.forEach(item => search.append(key, String(item)));
        }
        else {
            search.append(key, String(value));
        }
    });
    const query = search.toString();
    return query ? `?${query}` : '';
}
async function fetchWithAuth(url, options = {}) {
    const { baseURL, getToken, credentials = 'include' } = getApiConfig();
    const targetUrl = buildRequestUrl(baseURL, url);
    if (!isSameOriginRequest(baseURL, targetUrl)) {
        throw new Error('Cross-origin authenticated requests are not allowed.');
    }
    const token = await getToken();
    const headers = {};
    if (options.headers) {
        Object.assign(headers, options.headers);
    }
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    if (!(options.body instanceof FormData)) {
        headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
    }
    const response = await fetch(targetUrl, { ...options, headers, credentials });
    if (!response.ok) {
        throw new Error(await parseApiError(response));
    }
    if (response.status === 204) {
        return {};
    }
    return response.json();
}
const camelKeyCache = new Map();
const snakeToCamelKey = (key) => {
    if (!key.includes('_')) {
        return key;
    }
    const cached = camelKeyCache.get(key);
    if (cached) {
        return cached;
    }
    const converted = key.replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase());
    camelKeyCache.set(key, converted);
    return converted;
};
const isPlainObject = (value) => !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    !(value instanceof File) &&
    !(value instanceof Blob) &&
    !(value instanceof FormData);
const camelCaseKeysDeep = (input) => {
    if (Array.isArray(input)) {
        return input.map(item => camelCaseKeysDeep(item));
    }
    if (isPlainObject(input)) {
        const result = {};
        Object.entries(input).forEach(([key, value]) => {
            result[snakeToCamelKey(key)] = camelCaseKeysDeep(value);
        });
        return result;
    }
    return input;
};
const ensureArray = (value) => (Array.isArray(value) ? value : []);
const asList = (data) => {
    if (Array.isArray(data))
        return data;
    if (data && typeof data === 'object' && Array.isArray(data.results)) {
        return data.results;
    }
    return [];
};
const extractNext = (data) => {
    if (data && typeof data === 'object' && 'next' in data) {
        const value = data.next;
        return value ?? null;
    }
    return null;
};
const toPaginatedList = (data, mapFn) => {
    const base = data && typeof data === 'object' ? data : {};
    const results = asList(data).map(mapFn);
    return {
        count: typeof base.count === 'number' ? base.count : results.length,
        next: base.next ?? null,
        previous: base.previous ?? null,
        results,
    };
};
// -------- Shared Mapping Helpers --------
const mapShiftSlot = (api) => camelCaseKeysDeep(api);
const mapShiftAssignment = (api) => camelCaseKeysDeep(api);
const mapShiftCounterOfferSlot = (api) => camelCaseKeysDeep(api);
const mapShiftCounterOffer = (api) => {
    const base = camelCaseKeysDeep(api);
    return {
        ...base,
        slots: ensureArray(api.slots).map(mapShiftCounterOfferSlot),
    };
};
const mapShiftMemberStatus = (api) => {
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
const mapShiftInterest = (api) => {
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
const mapShiftShareLink = (api) => camelCaseKeysDeep(api);
const mapShiftRatingSummary = (api) => camelCaseKeysDeep(api);
const mapShiftRatingComment = (api) => camelCaseKeysDeep(api);
const mapShift = (api) => {
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
const mapRosterAssignment = (api) => camelCaseKeysDeep(api);
const mapWorkerShiftRequest = (api) => camelCaseKeysDeep(api);
const mapOpenShift = (api) => camelCaseKeysDeep(api);
const mapRosterPharmacyMember = (api) => camelCaseKeysDeep(api);
const mapShiftApplication = (api) => camelCaseKeysDeep(api);
const mapOwnerShiftSummary = (api) => camelCaseKeysDeep(api);
const mapPharmacySummaryRecord = (api) => camelCaseKeysDeep(api);
const mapChain = (api) => camelCaseKeysDeep(api);
const mapUserAvailability = (api) => camelCaseKeysDeep(api);
const mapNotification = (api) => ({
    id: api.id,
    type: api.type,
    title: api.title,
    body: api.body,
    actionUrl: api.action_url,
    payload: api.payload,
    createdAt: api.created_at,
    readAt: api.read_at,
});
const mapMembershipSummary = (api) => ({
    id: Number(api.id),
    pharmacyId: api.pharmacy_id ?? api.pharmacy?.id ?? null,
    pharmacyName: api.pharmacy_name ?? api.pharmacy?.name ?? null,
    pharmacyDetail: api.pharmacy_detail ? camelCaseKeysDeep(api.pharmacy_detail) : null,
    role: api.role ?? null,
    user: api.user ?? null,
    email: api.email ?? api.user_details?.email ?? null,
    name: api.name ?? null,
    invited_name: api.invited_name ?? null,
    user_details: api.user_details ? camelCaseKeysDeep(api.user_details) : null,
    employment_type: api.employment_type ?? null,
    job_title: api.job_title ?? null,
    is_active: api.is_active ?? false,
    status: api.status ?? null,
    is_pharmacy_owner: api.is_pharmacy_owner ?? false,
    is_pharmacy_admin: api.is_pharmacy_admin ?? false,
    admin_level: api.admin_level ?? null,
    admin_level_label: api.admin_level_label ?? null,
    admin_level_description: api.admin_level_description ?? null,
    employmentType: api.employment_type ?? null,
    jobTitle: api.job_title ?? null,
    isActive: api.is_active ?? false,
    userDetails: api.user_details ? camelCaseKeysDeep(api.user_details) : null,
    invitedName: api.invited_name ?? null,
    isPharmacyOwner: api.is_pharmacy_owner ?? false,
    isPharmacyAdmin: api.is_pharmacy_admin ?? false,
    adminLevel: api.admin_level ?? null,
    adminLevelLabel: api.admin_level_label ?? null,
    adminLevelDescription: api.admin_level_description ?? null,
});
const mapMembershipApplication = (api) => camelCaseKeysDeep(api);
// ============ AUTH ============
export function login(credentials) {
    return fetchApi('/users/login/', { method: 'POST', body: JSON.stringify(credentials) });
}
export function register(data) {
    return fetchApi('/users/register/', { method: 'POST', body: JSON.stringify(data) });
}
export function refreshToken(refresh) {
    return fetchApi('/users/token/refresh/', { method: 'POST', body: JSON.stringify({ refresh }) });
}
export function verifyOtp(data) {
    return fetchApi('/users/verify-otp/', { method: 'POST', body: JSON.stringify(data) });
}
export function resendOtp(data) {
    return fetchApi('/users/resend-otp/', { method: 'POST', body: JSON.stringify(data) });
}
export function mobileRequestOtp(data) {
    return fetchApi('/users/mobile/request-otp/', { method: 'POST', body: JSON.stringify(data) });
}
export function mobileVerifyOtp(data) {
    return fetchApi('/users/mobile/verify-otp/', { method: 'POST', body: JSON.stringify(data) });
}
export function mobileResendOtp(data) {
    return fetchApi('/users/mobile/resend-otp/', { method: 'POST', body: JSON.stringify(data) });
}
export function deleteAccount() {
    return fetchApi(API_ENDPOINTS.deleteAccount, { method: 'DELETE' });
}
export function getCurrentUser() {
    return fetchApi('/users/me/');
}
export function passwordReset(email) {
    return fetchApi('/users/password-reset/', { method: 'POST', body: JSON.stringify({ email }), skipAuth: true });
}
export function passwordResetConfirm(data) {
    return fetchApi('/users/password-reset-confirm/', { method: 'POST', body: JSON.stringify(data), skipAuth: true });
}
export function contactSupport(payload) {
    return fetchApi(API_ENDPOINTS.contactSupport, { method: 'POST', body: JSON.stringify(payload) });
}
export function inviteOrgUser(data) {
    return fetchApi('/users/invite-org-user/', { method: 'POST', body: JSON.stringify(data) });
}
export function getOrganizationMemberships(params) {
    const query = buildQuery(params);
    return fetchApi(`/users/organization-memberships/${query}`);
}
export function updateOrganizationMembership(id, data) {
    return fetchApi(`/users/organization-memberships/${id}/`, { method: 'PATCH', body: JSON.stringify(data) });
}
export function deleteOrganizationMembership(id) {
    return fetchApi(`/users/organization-memberships/${id}/`, { method: 'DELETE' });
}
export function getOrganizationRoleDefinitions() {
    return fetchApi('/users/organization-role-definitions/');
}
export function searchUsers(query) {
    return fetchApi(`/users/?search=${encodeURIComponent(query)}`);
}
// ============ ONBOARDING ============
export function getOnboarding(role) {
    const safeRole = role === 'other_staff' ? 'otherstaff' : role;
    return fetchApi(`/client-profile/${safeRole}/onboarding/me/`);
}
export function updateOnboarding(role, data) {
    const safeRole = role === 'other_staff' ? 'otherstaff' : role;
    const body = data instanceof FormData || typeof data === 'string' ? data : JSON.stringify(data);
    return fetchApi(`/client-profile/${safeRole}/onboarding/me/`, { method: 'PATCH', body });
}
export function createOnboarding(role, data) {
    const safeRole = role === 'other_staff' ? 'otherstaff' : role;
    return fetchApi(`/client-profile/${safeRole}/onboarding/`, { method: 'POST', body: JSON.stringify(data) });
}

export function getOnboardingDetail(rawRole: string) {
    const safeRole = rawRole === 'other_staff' ? 'otherstaff' : rawRole;
    return fetchApi(`/client-profile/${safeRole}/onboarding/me/`);
}

// Shift rate calculation (preview) reused by post shift and counter-offer flows.
export function calculateShiftRates(payload) {
    return fetchApi('/client-profile/shifts/calculate-rates/', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}

export function updateOnboardingForm(rawRole: string, body: FormData) {
    const safeRole = rawRole === 'other_staff' ? 'otherstaff' : rawRole;
    return fetchApi(`/client-profile/${safeRole}/onboarding/me/`, {
        method: 'PATCH',
        body,
    });
}
export function submitRefereeResponse(token, data) {
    return fetchApi(`/client-profile/onboarding/submit-reference/${token}/`, { method: 'POST', body: JSON.stringify(data) });
}
export function refereeReject(pk, refIndex) {
    return fetchApi(`/client-profile/onboarding/referee-reject/${pk}/${refIndex}/`, { method: 'POST' });
}
export function claimOnboarding(data) {
    return fetchApi('/client-profile/owner-onboarding/claim/', { method: 'POST', body: JSON.stringify(data) });
}
// ============ ORGANIZATIONS ============
export function getOrganizations() {
    return fetchApi('/client-profile/organizations/');
}
export function getOrganizationById(id) {
    return fetchApi(`/client-profile/organizations/${id}/`);
}
export function createOrganization(data) {
    return fetchApi('/client-profile/organizations/', { method: 'POST', body: JSON.stringify(data) });
}
export function getOrganizationDashboard(orgId, params) {
    const query = buildQuery(params);
    return fetchApi(`/client-profile/dashboard/organization/${orgId}/${query}`);
}
// ============ PHARMACIES ============
export function getPharmacies(params) {
    const query = buildQuery(params);
    return fetchApi(`/client-profile/pharmacies/${query}`);
}
export async function fetchPharmaciesService(params) {
    const data = await getPharmacies(params);
    return asList(data).map(mapPharmacySummaryRecord);
}
export async function fetchChainsService() {
    const data = await getChains();
    return asList(data).map(mapChain);
}
export async function fetchChainDetailService(chainId) {
    const data = await getChainDetail(chainId);
    return mapChain(data);
}
export async function createChainService(formData) {
    const data = await createChain(formData);
    return mapChain(data);
}
export async function updateChainService(chainId, formData) {
    const data = await updateChain(chainId, formData);
    return mapChain(data);
}
export async function deleteChainService(chainId) {
    await deleteChain(chainId);
}
export async function fetchChainPharmaciesService(chainId) {
    const data = await getChainPharmacies(chainId);
    return asList(data).map(mapPharmacySummaryRecord);
}
export function getPharmacyById(id) {
    return fetchApi(`/client-profile/pharmacies/${id}/`);
}
export function createPharmacy(data) {
    const body = data instanceof FormData ? data : JSON.stringify(data);
    return fetchApi('/client-profile/pharmacies/', { method: 'POST', body });
}
export function updatePharmacy(id, data) {
    const body = data instanceof FormData ? data : JSON.stringify(data);
    return fetchApi(`/client-profile/pharmacies/${id}/`, { method: 'PATCH', body });
}
export function lookupPharmacyAbn(data) {
    return fetchApi('/client-profile/pharmacies/lookup-abn/', { method: 'POST', body: JSON.stringify(data) });
}
export function deletePharmacy(id) {
    return fetchApi(`/client-profile/pharmacies/${id}/`, { method: 'DELETE' });
}
// Pharmacy Claims
export function getPharmacyClaims(params) {
    const query = buildQuery(params);
    return fetchApi(`/client-profile/pharmacy-claims/${query}`);
}
export function getPharmacyClaimDetail(id) {
    return fetchApi(`/client-profile/pharmacy-claims/${id}/`);
}
export function approvePharmacyClaim(id) {
    return fetchApi(`/client-profile/pharmacy-claims/${id}/approve/`, { method: 'POST' });
}
export function updatePharmacyClaim(id, data) {
    return fetchApi(`/client-profile/pharmacy-claims/${id}/`, { method: 'PATCH', body: JSON.stringify(data) });
}
// Pharmacy Admins
export function getPharmacyAdmins(params) {
    const query = buildQuery(params);
    return fetchApi(`/client-profile/pharmacy-admins/${query}`);
}
export function getPharmacyAdminDetail(id) {
    return fetchApi(`/client-profile/pharmacy-admins/${id}/`);
}
export function createPharmacyAdmin(data) {
    return fetchApi('/client-profile/pharmacy-admins/', { method: 'POST', body: JSON.stringify(data) });
}
export function deletePharmacyAdmin(id) {
    return fetchApi(`/client-profile/pharmacy-admins/${id}/`, { method: 'DELETE' });
}
export async function fetchPharmacyAdminsService(params) {
    const data = await getPharmacyAdmins(params);
    const list = Array.isArray(data?.results)
        ? data.results
        : Array.isArray(data)
            ? data
            : [];
    return list;
}
export async function createPharmacyAdminService(payload) {
    const data = await createPharmacyAdmin(payload);
    return data;
}
export async function deletePharmacyAdminService(id) {
    await deletePharmacyAdmin(id);
}
// ============ CHAINS ============
export function getChains() {
    return fetchApi('/client-profile/chains/');
}
export function getChainDetail(id) {
    return fetchApi(`/client-profile/chains/${id}/`);
}
export function createChain(data) {
    return fetchApi('/client-profile/chains/', { method: 'POST', body: data });
}
export function updateChain(id, data) {
    return fetchApi(`/client-profile/chains/${id}/`, { method: 'PUT', body: data });
}
export function deleteChain(id) {
    return fetchApi(`/client-profile/chains/${id}/`, { method: 'DELETE' });
}
export function getChainPharmacies(id) {
    return fetchApi(`/client-profile/chains/${id}/pharmacies/`);
}
export function addPharmacyToChain(chainId, pharmacyId) {
    return fetchApi(`/client-profile/chains/${chainId}/add_pharmacy/`, { method: 'POST', body: JSON.stringify({ pharmacy_id: pharmacyId }) });
}
export function removePharmacyFromChain(chainId, pharmacyId) {
    return fetchApi(`/client-profile/chains/${chainId}/remove_pharmacy/`, { method: 'POST', body: JSON.stringify({ pharmacy_id: pharmacyId }) });
}
export function addUserToChain(chainId, userId) {
    return fetchApi(`/client-profile/chains/${chainId}/add_user/`, { method: 'POST', body: JSON.stringify({ user_id: userId }) });
}
// ============ MEMBERSHIPS ============
export function getMemberships(params) {
    const query = buildQuery(params);
    return fetchApi(`/client-profile/memberships/${query}`);
}
export function getMyMemberships(params) {
    const query = buildQuery(params);
    return fetchApi(`/client-profile/my-memberships/${query}`);
}
export function createMembership(data) {
    return fetchApi('/client-profile/memberships/', { method: 'POST', body: JSON.stringify(data) });
}
export async function createMembershipInviteService(payload) {
    const data = await createMembership(payload);
    return mapMembershipSummary(data);
}
export function bulkInviteMembers(data) {
    return fetchApi('/client-profile/memberships/bulk_invite/', { method: 'POST', body: JSON.stringify(data) });
}
export async function bulkInviteMembersService(payload) {
    const data = await bulkInviteMembers(payload);
    return data;
}
export function deleteMembership(id) {
    return fetchApi(`/client-profile/memberships/${id}/`, { method: 'DELETE' });
}
export async function deleteMembershipService(membershipId) {
    await deleteMembership(membershipId);
}
export function getMembershipInviteLinks(params) {
    const query = buildQuery(params);
    return fetchApi(`/client-profile/membership-invite-links/${query}`);
}
export function createMembershipInviteLink(data) {
    return fetchApi('/client-profile/membership-invite-links/', { method: 'POST', body: JSON.stringify(data) });
}
export async function createMembershipInviteLinkService(payload) {
    const data = await createMembershipInviteLink(payload);
    return data;
}
export function getMembershipApplications(params) {
    const query = buildQuery(params);
    return fetchApi(`/client-profile/membership-applications/${query}`);
}
export function approveMembershipApplication(id, data) {
    return fetchApi(`/client-profile/membership-applications/${id}/approve/`, {
        method: 'POST',
        body: JSON.stringify(data),
    });
}
export function rejectMembershipApplication(id) {
    return fetchApi(`/client-profile/membership-applications/${id}/reject/`, { method: 'POST' });
}
export function createMembershipInvite(data) {
    return fetchApi('/client-profile/memberships/', { method: 'POST', body: JSON.stringify(data) });
}
export function getMagicMembershipInfo(token) {
    return fetchApi(`/client-profile/magic/memberships/${token}/`);
}
export function applyMagicMembership(token, data) {
    return fetchApi(`/client-profile/magic/memberships/${token}/apply/`, { method: 'POST', body: JSON.stringify(data) });
}
// ============ SHIFTS ============
export function getCommunityShifts(params) {
    const query = buildQuery(params);
    return fetchApi(`/client-profile/community-shifts/${query}`);
}
export function getPublicShifts(params) {
    const query = buildQuery(params);
    return fetchApi(`/client-profile/public-shifts/${query}`);
}
export function getActiveShifts() {
    return fetchApi('/client-profile/shifts/active/');
}
export function getConfirmedShifts() {
    return fetchApi('/client-profile/shifts/confirmed/');
}
export function getHistoryShifts() {
    return fetchApi('/client-profile/shifts/history/');
}
export function getMyConfirmedShifts() {
    return fetchApi('/client-profile/my-confirmed-shifts/');
}
export function getMyHistoryShifts(params) {
    const query = buildQuery(params);
    return fetchApi(`/client-profile/my-history-shifts/${query}`);
}
export function getShiftInterests(params) {
    const query = buildQuery(params);
    return fetchApi(`/client-profile/shift-interests/${query}`);
}
export function getShiftRejections(params) {
    const query = buildQuery(params);
    return fetchApi(`/client-profile/shift-rejections/${query}`);
}
export function getShiftCounterOffers(shiftId) {
    return fetchApi(`/client-profile/shifts/${shiftId}/counter-offers/`);
}
export function createShiftCounterOffer(shiftId, data) {
    return fetchApi(`/client-profile/shifts/${shiftId}/counter-offers/`, {
        method: 'POST',
        body: JSON.stringify(data),
    });
}
export function acceptShiftCounterOffer(shiftId, offerId, data) {
    const slotId = data?.slotId ?? data?.slot_id ?? null;
    const query = slotId != null ? `?slot_id=${encodeURIComponent(slotId)}` : '';
    return fetchApi(`/client-profile/shifts/${shiftId}/counter-offers/${offerId}/accept/${query}`, {
        method: 'POST',
        body: slotId != null ? JSON.stringify({ slot_id: slotId }) : undefined,
    });
}
export function rejectShiftCounterOffer(shiftId, offerId) {
    return fetchApi(`/client-profile/shifts/${shiftId}/counter-offers/${offerId}/reject/`, { method: 'POST' });
}

export function fetchShiftOffers(query = '') {
    return fetchApi(`/client-profile/shift-offers/${query}`);
}

export function acceptShiftOffer(offerId) {
    return fetchApi(`/client-profile/shift-offers/${offerId}/accept/`, { method: 'POST' });
}

export function declineShiftOffer(offerId) {
    return fetchApi(`/client-profile/shift-offers/${offerId}/decline/`, { method: 'POST' });
}
export function buzzShiftOffer(offerId) {
    return fetchApi(`/client-profile/shift-offers/${offerId}/buzz/`, { method: 'POST' });
}
export function getCommunityShiftDetail(id) {
    return fetchApi(`/client-profile/community-shifts/${id}`);
}
export function getPublicShiftDetail(id) {
    return fetchApi(`/client-profile/public-shifts/${id}`);
}
export function getActiveShiftDetail(id) {
    return fetchApi(`/client-profile/shifts/active/${id}`);
}
export function deleteActiveShift(id) {
    return fetchApi(`/client-profile/shifts/active/${id}/`, { method: 'DELETE' });
}
export function getActiveShiftMemberStatus(id, params) {
    const query = buildQuery(params);
    return fetchApi(`/client-profile/shifts/${id}/member_status/${query}`);
}
export function getConfirmedShiftDetail(id) {
    return fetchApi(`/client-profile/shifts/confirmed/${id}/`);
}
export function getWorkerShiftDetail(id) {
    return fetchApi(`/client-profile/shifts/${id}/`);
}
export function createShift(data) {
    return fetchApi('/client-profile/community-shifts/', { method: 'POST', body: JSON.stringify(data) });
}
export function updateShift(id, data) {
    return fetchApi(`/client-profile/community-shifts/${id}/`, { method: 'PATCH', body: JSON.stringify(data) });
}
export function deleteShift(id) {
    return fetchApi(`/client-profile/community-shifts/${id}/`, { method: 'DELETE' });
}
export function claimShift(id, data) {
    return fetchApi(`/client-profile/community-shifts/${id}/claim-shift/`, {
        method: 'POST',
        body: JSON.stringify(data ?? {}),
    });
}
export function expressInterestInShift(id, data) {
    return fetchApi(`/client-profile/shifts/${id}/express_interest/`, {
        method: 'POST',
        body: JSON.stringify(data ?? {}),
    });
}
export function expressInterestInCommunityShift(id, data) {
    return fetchApi(`/client-profile/community-shifts/${id}/express_interest/`, {
        method: 'POST',
        body: JSON.stringify(data ?? {}),
    });
}
export function expressInterestInPublicShift(id, data) {
    return fetchApi(`/client-profile/public-shifts/${id}/express_interest/`, {
        method: 'POST',
        body: JSON.stringify(data ?? {}),
    });
}
export function revealProfile(id, data) {
    return fetchApi(`/client-profile/shifts/${id}/reveal_profile/`, {
        method: 'POST',
        body: JSON.stringify(data ?? {}),
    });
}
export function acceptUserToShift(id, data) {
    return fetchApi(`/client-profile/shifts/${id}/accept_user/`, { method: 'POST', body: JSON.stringify(data) });
}
export function escalateCommunityShift(id) {
    return fetchApi(`/client-profile/community-shifts/${id}/escalate/`, { method: 'POST' });
}
export function getCommunityShiftMemberStatus(id, params) {
    const query = buildQuery(params);
    return fetchApi(`/client-profile/community-shifts/${id}/member_status/${query}`);
}
export function rejectCommunityShift(id, data) {
    return fetchApi(`/client-profile/community-shifts/${id}/reject/`, {
        method: 'POST',
        body: JSON.stringify(data ?? {}),
    });
}
export function rejectShift(id, data) {
    return fetchApi(`/client-profile/shifts/${id}/reject/`, {
        method: 'POST',
        body: JSON.stringify(data ?? {}),
    });
}
export function viewAssignedShiftProfile(type, id, data) {
    return fetchApi(`/client-profile/shifts/${type}/${id}/view_assigned_profile/`, {
        method: 'POST',
        body: JSON.stringify(data),
    });
}
export function generateShareLink(id) {
    return fetchApi(`/client-profile/shifts/${id}/generate-share-link/`, { method: 'POST' });
}
export function getOwnerShifts(params) {
    const query = buildQuery(params);
    return fetchApi(`/client-profile/shifts/owner/${query}`);
}
export function createOwnerShift(data) {
    return fetchApi('/client-profile/shifts/', { method: 'POST', body: JSON.stringify(data) });
}
export function updateOwnerShift(id, data) {
    return fetchApi(`/client-profile/shifts/${id}/`, { method: 'PATCH', body: JSON.stringify(data) });
}
export function getShiftApplications(id) {
    return fetchApi(`/client-profile/shifts/${id}/applications/`);
}
export function acceptShiftApplication(shiftId, applicationId) {
    return fetchApi(`/client-profile/shifts/${shiftId}/applications/${applicationId}/accept/`, { method: 'POST' });
}
export function rejectShiftApplication(shiftId, applicationId) {
    return fetchApi(`/client-profile/shifts/${shiftId}/applications/${applicationId}/reject/`, { method: 'POST' });
}
export function getPublicJobBoard(params?: { organization?: number | string }) {
    const query = buildQuery(params);
    return fetchApi(`/client-profile/public-job-board/${query}`, { skipAuth: true });
}
export function getViewSharedShift(params) {
    const query = new URLSearchParams(params).toString();
    return fetchApi(`/client-profile/view-shared-shift/?${query}`, { skipAuth: true });
}
export function getPublicOrganization(slug: string) {
    return fetchApi(`/client-profile/organizations/public/${slug}/`, { skipAuth: true });
}
const toInterestParams = (filters) => ({
    shift: filters?.shiftId,
    user: filters?.userId,
});
const toShiftListParams = (filters) => ({
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
const buildSlotPayload = (slotId, slotIds) => {
    if (Array.isArray(slotIds)) {
        return { slot_ids: slotIds };
    }
    if (slotId === undefined) {
        return undefined;
    }
    return { slot_id: slotId };
};
const toOwnerShiftParams = (filters) => ({
    pharmacy_id: filters?.pharmacyId,
    status: filters?.status,
});
export async function fetchActiveShifts() {
    const data = await getActiveShifts();
    return asList(data).map(mapShift);
}
export async function fetchActiveShiftDetailService(shiftId) {
    const data = await getActiveShiftDetail(shiftId);
    return mapShift(data);
}
export async function fetchCommunityShifts(filters) {
    const data = await getCommunityShifts(toShiftListParams(filters));
    return toPaginatedList(data, mapShift);
}
export async function fetchCommunityShiftDetailService(shiftId) {
    const data = await getCommunityShiftDetail(shiftId);
    return mapShift(data);
}
export async function fetchPublicShifts(filters) {
    const data = await getPublicShifts(toShiftListParams(filters));
    return toPaginatedList(data, mapShift);
}
export async function fetchPublicShiftDetailService(shiftId) {
    const data = await getPublicShiftDetail(shiftId);
    return mapShift(data);
}
export async function fetchConfirmedShifts() {
    const data = await getConfirmedShifts();
    return asList(data).map(mapShift);
}
export async function fetchConfirmedShiftDetailService(shiftId) {
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
export async function fetchWorkerShiftDetailService(shiftId) {
    const data = await getWorkerShiftDetail(shiftId);
    return mapShift(data);
}
export async function fetchPosterShiftDetailService(shiftId) {
    const data = await getActiveShiftDetail(shiftId);
    return mapShift(data);
}
export async function fetchShiftInterests(filters) {
    const data = await getShiftInterests(toInterestParams(filters));
    return asList(data).map(mapShiftInterest);
}
export async function fetchShiftRejections(filters) {
    const data = await getShiftRejections(toInterestParams(filters));
    return asList(data).map(mapShiftInterest);
}
export async function fetchSavedShifts() {
    const data = await fetchApi(API_ENDPOINTS.getShiftSaved);
    return asList(data).map(camelCaseKeysDeep);
}
export async function saveShift(shiftId) {
    const data = await fetchApi(API_ENDPOINTS.getShiftSaved, {
        method: "POST",
        body: JSON.stringify({ shift: shiftId }),
    });
    return camelCaseKeysDeep(data);
}
export async function deleteSavedShift(savedId) {
    await fetchApi(`${API_ENDPOINTS.getShiftSaved}${savedId}/`, { method: "DELETE" });
    return true;
}
export async function fetchShiftCounterOffersService(shiftId) {
    const data = await getShiftCounterOffers(shiftId);
    return asList(data).map(mapShiftCounterOffer);
}
export async function submitShiftCounterOfferService(payload) {
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
export async function acceptShiftCounterOfferService(payload) {
    await acceptShiftCounterOffer(payload.shiftId, payload.offerId, payload);
}
export async function rejectShiftCounterOfferService(payload) {
    await rejectShiftCounterOffer(payload.shiftId, payload.offerId);
}
export async function fetchShiftOffersService(filters?: { status?: string }) {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    const query = params.toString();
    const data = await fetchShiftOffers(query ? `?${query}` : '');
    return asList(data).map(camelCaseKeysDeep);
}
export async function acceptShiftOfferService(offerId: number) {
    await acceptShiftOffer(offerId);
}
export async function declineShiftOfferService(offerId: number) {
    await declineShiftOffer(offerId);
}
export async function buzzShiftOfferService(offerId: number) {
    return camelCaseKeysDeep(await buzzShiftOffer(offerId));
}
export async function fetchShiftMemberStatus(shiftId, options) {
    const params = {
        slot_id: options?.slotId,
        visibility: options?.visibility,
    };
    const data = await getActiveShiftMemberStatus(shiftId, params);
    return asList(data).map(mapShiftMemberStatus);
}
export async function generateShiftShareLinkService(shiftId) {
    const data = await generateShareLink(shiftId);
    return mapShiftShareLink(data);
}
export async function escalateShiftService(shiftId, payload) {
    await fetchApi(`/client-profile/shifts/active/${shiftId}/escalate/`, {
        method: 'POST',
        body: JSON.stringify({ target_visibility: payload.targetVisibility }),
    });
}
export async function deleteActiveShiftService(shiftId) {
    await deleteActiveShift(shiftId);
}
export async function acceptShiftCandidateService(shiftId, payload) {
    const data = await acceptUserToShift(shiftId, { user_id: payload.userId, slot_id: payload.slotId });
    return camelCaseKeysDeep(data);
}
export async function revealShiftInterestService(shiftId, payload) {
    const data = await revealProfile(shiftId, { user_id: payload.userId, slot_id: payload.slotId });
    return camelCaseKeysDeep(data);
}
export async function expressInterestInCommunityShiftService(params) {
    await expressInterestInCommunityShift(params.shiftId, buildSlotPayload(params.slotId, params.slotIds));
}
export async function expressInterestInPublicShiftService(params) {
    await expressInterestInPublicShift(params.shiftId, buildSlotPayload(params.slotId, params.slotIds));
}
export async function expressInterestInShiftService(params) {
    await expressInterestInShift(params.shiftId, buildSlotPayload(params.slotId, params.slotIds));
}
export async function rejectCommunityShiftService(params) {
    await rejectCommunityShift(params.shiftId, buildSlotPayload(params.slotId, params.slotIds));
}
export async function rejectShiftService(params) {
    await rejectShift(params.shiftId, buildSlotPayload(params.slotId, params.slotIds));
}
export async function claimShiftService(params) {
    await claimShift(params.shiftId, buildSlotPayload(params.slotId));
}
export async function viewAssignedShiftProfileService(params) {
    const data = await viewAssignedShiftProfile(params.type, params.shiftId, {
        user_id: params.userId,
        slot_id: params.slotId,
    });
    return camelCaseKeysDeep(data);
}
export async function fetchOwnerShiftsService(filters) {
    const data = await getOwnerShifts(toOwnerShiftParams(filters));
    return asList(data).map(mapOwnerShiftSummary);
}
export async function createOwnerShiftService(payload) {
    await createOwnerShift(payload);
}
export async function updateOwnerShiftService(shiftId, payload) {
    await updateOwnerShift(shiftId, payload);
}
export async function fetchShiftApplicationsService(shiftId) {
    const data = await getShiftApplications(shiftId);
    return asList(data).map(mapShiftApplication);
}
export async function acceptShiftApplicationService(shiftId, applicationId) {
    await acceptShiftApplication(shiftId, applicationId);
}
export async function rejectShiftApplicationService(shiftId, applicationId) {
    await rejectShiftApplication(shiftId, applicationId);
}
const toRosterQueryParams = (filters) => ({
    pharmacy: filters?.pharmacyId,
    start_date: filters?.startDate,
    end_date: filters?.endDate,
});
export function getRosterOwner(params) {
    const query = buildQuery(params);
    return fetchApi(`/client-profile/roster-owner/${query}`);
}
export function getRosterWorker(params) {
    const query = buildQuery(params);
    return fetchApi(`/client-profile/roster-worker/${query}`);
}
export function createShiftAndAssign(data) {
    return fetchApi('/client-profile/roster/create-and-assign-shift/', { method: 'POST', body: JSON.stringify(data) });
}
export function updateRosterShift(id, data) {
    return fetchApi(`/client-profile/roster-shifts/${id}/`, { method: 'PATCH', body: JSON.stringify(data) });
}
export function deleteRosterShift(id) {
    return fetchApi(`/client-profile/roster-shifts/${id}/`, { method: 'DELETE' });
}
export function escalateRosterShift(id, data) {
    const options = { method: 'POST' };
    if (data) {
        options.body = JSON.stringify(data);
    }
    return fetchApi(`/client-profile/roster-shifts/${id}/escalate/`, options);
}
export function getOwnerOpenShifts(params) {
    const query = buildQuery(params);
    return fetchApi(`/client-profile/roster-shifts/list-open-shifts/${query}`);
}
export function createOpenShift(data) {
    return fetchApi('/client-profile/roster-shifts/create-open-shift/', { method: 'POST', body: JSON.stringify(data) });
}
export function deleteRosterAssignment(id) {
    return fetchApi(`/client-profile/roster-owner/${id}/`, { method: 'DELETE' });
}
export function getRosterOwnerMembers(pharmacyId) {
    return fetchApi(`/client-profile/roster-owner/members-for-roster/?pharmacy_id=${pharmacyId}`);
}
export function getRosterWorkerPharmacies() {
    return fetchApi('/client-profile/roster-worker/pharmacies/');
}
export async function fetchRosterOwnerAssignments(params) {
    const data = await getRosterOwner(toRosterQueryParams(params));
    return asList(data).map(mapRosterAssignment);
}
export async function fetchRosterWorkerAssignments(params) {
    const data = await getRosterWorker(toRosterQueryParams(params));
    return asList(data).map(mapRosterAssignment);
}
export async function fetchWorkerShiftRequestsService(params) {
    const data = await getWorkerShiftRequests(toRosterQueryParams(params));
    return asList(data).map(mapWorkerShiftRequest);
}
export async function fetchOwnerOpenShifts(params) {
    const data = await getOwnerOpenShifts(toShiftListParams(params));
    return asList(data).map(mapOpenShift);
}
export async function fetchRosterOwnerMembersService(pharmacyId) {
    const data = await getRosterOwnerMembers(pharmacyId);
    return asList(data).map(mapRosterPharmacyMember);
}
export async function fetchRosterWorkerPharmaciesService() {
    const data = await getRosterWorkerPharmacies();
    return asList(data).map(mapPharmacySummaryRecord);
}
export async function createShiftAndAssignService(payload) {
    await createShiftAndAssign(payload);
}
export async function updateRosterShiftService(shiftId, payload) {
    await updateRosterShift(shiftId, payload);
}
export async function deleteRosterShiftService(shiftId) {
    await deleteRosterShift(shiftId);
}
export async function escalateRosterShiftService(shiftId, payload) {
    await escalateRosterShift(shiftId, payload);
}
export async function deleteRosterAssignmentService(assignmentId) {
    await deleteRosterAssignment(assignmentId);
}
export async function createOpenShiftService(payload) {
    await createOpenShift(payload);
}
// ============ LEAVE & SWAP ============
export function getLeaveRequests() {
    return fetchApi('/client-profile/leave-requests/');
}
export function createLeaveRequest(data) {
    return fetchApi('/client-profile/leave-requests/', { method: 'POST', body: JSON.stringify(data) });
}
export function updateLeaveRequest(id, data) {
    return fetchApi(`/client-profile/leave-requests/${id}/`, { method: 'PATCH', body: JSON.stringify(data) });
}
export function approveLeaveRequest(id) {
    return fetchApi(`/client-profile/leave-requests/${id}/approve/`, { method: 'POST' });
}
export function rejectLeaveRequest(id) {
    return fetchApi(`/client-profile/leave-requests/${id}/reject/`, { method: 'POST' });
}
export function deleteLeaveRequest(id) {
    return fetchApi(`/client-profile/leave-requests/${id}/`, { method: 'DELETE' });
}
export function getWorkerShiftRequests(params) {
    const query = buildQuery(params);
    return fetchApi(`/client-profile/worker-shift-requests/${query}`);
}
export function createWorkerShiftRequest(data) {
    return fetchApi('/client-profile/worker-shift-requests/', { method: 'POST', body: JSON.stringify(data) });
}
export function updateWorkerShiftRequest(id, data) {
    return fetchApi(`/client-profile/worker-shift-requests/${id}/`, { method: 'PATCH', body: JSON.stringify(data) });
}
export function approveWorkerShiftRequest(id) {
    return fetchApi(`/client-profile/worker-shift-requests/${id}/approve/`, { method: 'POST' });
}
export function rejectWorkerShiftRequest(id) {
    return fetchApi(`/client-profile/worker-shift-requests/${id}/reject/`, { method: 'POST' });
}
export function deleteWorkerShiftRequest(id) {
    return fetchApi(`/client-profile/worker-shift-requests/${id}/`, { method: 'DELETE' });
}
export async function createLeaveRequestService(payload) {
    const data = await createLeaveRequest(payload);
    return camelCaseKeysDeep(data);
}
export async function updateLeaveRequestService(leaveId, payload) {
    const data = await updateLeaveRequest(leaveId, payload);
    return camelCaseKeysDeep(data);
}
export async function deleteLeaveRequestService(leaveId) {
    await deleteLeaveRequest(leaveId);
}
export async function approveLeaveRequestService(leaveId) {
    await approveLeaveRequest(leaveId);
}
export async function rejectLeaveRequestService(leaveId) {
    await rejectLeaveRequest(leaveId);
}
export async function createWorkerShiftRequestService(payload) {
    const data = await createWorkerShiftRequest(payload);
    return camelCaseKeysDeep(data);
}
export async function updateWorkerShiftRequestService(requestId, payload) {
    const data = await updateWorkerShiftRequest(requestId, payload);
    return camelCaseKeysDeep(data);
}
export async function deleteWorkerShiftRequestService(requestId) {
    await deleteWorkerShiftRequest(requestId);
}
export async function approveWorkerShiftRequestService(requestId) {
    await approveWorkerShiftRequest(requestId);
}
export async function rejectWorkerShiftRequestService(requestId) {
    await rejectWorkerShiftRequest(requestId);
}
// ============ USER AVAILABILITY ============
export function getUserAvailability() {
    return fetchApi('/client-profile/user-availability/');
}
export function getUserAvailabilityDetail(id) {
    return fetchApi(`/client-profile/user-availability/${id}/`);
}
export function createUserAvailability(data) {
    return fetchApi('/client-profile/user-availability/', { method: 'POST', body: JSON.stringify(data) });
}
export function updateUserAvailability(id, data) {
    return fetchApi(`/client-profile/user-availability/${id}/`, { method: 'PATCH', body: JSON.stringify(data) });
}
export function deleteUserAvailability(id) {
    return fetchApi(`/client-profile/user-availability/${id}/`, { method: 'DELETE' });
}
export async function fetchUserAvailabilityService() {
    const data = await getUserAvailability();
    return asList(data).map(mapUserAvailability);
}
export async function createUserAvailabilityService(payload) {
    const data = await createUserAvailability(payload);
    return mapUserAvailability(data);
}
export async function updateUserAvailabilityService(id, payload) {
    const data = await updateUserAvailability(id, payload);
    return mapUserAvailability(data);
}
export async function deleteUserAvailabilityService(id) {
    await deleteUserAvailability(id);
}

// ============ PILL REWARDS ============
export async function fetchPillBalanceService() {
    return fetchApi('/client-profile/pill-rewards/balance/');
}

export async function fetchPillRewardRulesService() {
    return fetchApi('/client-profile/pill-rewards/rules/');
}

export async function fetchPillReferralCodeService() {
    return fetchApi('/client-profile/pill-rewards/referral-code/');
}

export async function fetchPillHistoryService(params) {
    const query = buildQuery(params);
    return fetchApi(`/client-profile/pill-rewards/history/${query}`);
}

export async function fetchPillReferralsService(params) {
    const query = buildQuery(params);
    return fetchApi(`/client-profile/pill-rewards/referrals/${query}`);
}

export async function createFriendPillReferralService(payload) {
    return fetchApi('/client-profile/pill-rewards/refer-friend/', {
        method: 'POST',
        body: payload,
    });
}

export async function createShiftPillReferralService(payload) {
    return fetchApi('/client-profile/pill-rewards/refer-shift/', {
        method: 'POST',
        body: payload,
    });
}

export async function claimPillReferralService(payload) {
    return fetchApi('/client-profile/pill-rewards/claim/', {
        method: 'POST',
        body: payload,
    });
}

// ============ INVOICES ============
export function getInvoices() {
    return fetchApi('/client-profile/invoices/');
}
export function getInvoiceDetail(id) {
    return fetchApi(`/client-profile/invoices/${id}/`);
}
export function createInvoice(data) {
    return fetchApi('/client-profile/invoices/', { method: 'POST', body: JSON.stringify(data) });
}
export function updateInvoice(id, data) {
    return fetchApi(`/client-profile/invoices/${id}/`, { method: 'PATCH', body: JSON.stringify(data) });
}
export function deleteInvoice(id) {
    return fetchApi(`/client-profile/invoices/${id}/`, { method: 'DELETE' });
}
export function generateInvoice(data) {
    const body = data instanceof FormData ? data : JSON.stringify(data);
    return fetchApi('/client-profile/invoices/generate/', { method: 'POST', body });
}
export function previewInvoice(id) {
    return fetchApi(`/client-profile/invoices/preview/${id}/`);
}
export function getInvoicePdfUrl(id) {
    const { baseURL } = getApiConfig();
    return `${baseURL}/client-profile/invoices/${id}/pdf/`;
}
export function sendInvoiceEmail(id) {
    return fetchApi(`/client-profile/invoices/${id}/send/`, { method: 'POST' });
}
export function reportInvoiceIssue(id, data = {}) {
    return fetchApi(`/client-profile/invoices/${id}/report-issue/`, { method: 'POST', body: JSON.stringify(data) });
}
export async function fetchMyMemberships(params) {
    const data = await getMyMemberships(params);
    const list = Array.isArray(data?.results)
        ? data.results
        : Array.isArray(data)
            ? data
            : [];
    return list.map(mapMembershipSummary);
}
export async function fetchMembershipsByPharmacy(pharmacyId) {
    const data = await getMemberships({ pharmacy_id: pharmacyId, page_size: 500 });
    const list = Array.isArray(data?.results)
        ? data.results
        : Array.isArray(data)
            ? data
            : [];
    return list.map(mapMembershipSummary);
}
export async function fetchMembershipApplicationsService(params) {
    const data = await getMembershipApplications(params);
    const list = Array.isArray(data?.results)
        ? data.results
        : Array.isArray(data)
            ? data
            : [];
    return list.map(item => mapMembershipApplication(item));
}
export async function approveMembershipApplicationService(applicationId, payload) {
    await approveMembershipApplication(applicationId, payload);
}
export async function rejectMembershipApplicationService(applicationId) {
    await rejectMembershipApplication(applicationId);
}
// ============ NOTIFICATIONS ============
export function getNotifications(page = 1) {
    return fetchApi(`/client-profile/notifications/?page=${page}`);
}
export function markNotificationsAsRead(ids) {
    return fetchApi('/client-profile/notifications/mark-read/', { method: 'POST', body: JSON.stringify(ids ? { ids } : {}) });
}
export async function fetchNotificationsPage(page = 1) {
    const data = await getNotifications(page);
    const list = Array.isArray(data?.results)
        ? data.results
        : Array.isArray(data)
            ? data
            : [];
    const notifications = list.map(mapNotification);
    return {
        count: typeof data?.count === 'number' ? data.count : notifications.length,
        next: data?.next ?? null,
        previous: data?.previous ?? null,
        results: notifications,
        unread: typeof data?.unread === 'number' ? data.unread : undefined,
        countUnread: typeof data?.count_unread === 'number' ? data.count_unread : undefined,
    };
}
export async function markNotificationsReadService(ids) {
    const response = await markNotificationsAsRead(ids);
    return {
        marked: typeof response?.marked === 'number' ? response.marked : undefined,
        unread: typeof response?.unread === 'number' ? response.unread : undefined,
    };
}
// ============ EXPLORER POSTS ============
export function getExplorerPosts() {
    return fetchApi('/client-profile/explorer-posts/');
}
export function getExplorerPostDetail(id) {
    return fetchApi(`/client-profile/explorer-posts/${id}/`);
}
export function getExplorerPostFeed(params) {
    const query = buildQuery(params);
    return fetchApi(`/client-profile/explorer-posts/feed/${query}`);
}
export function getPublicTalentFeed(params) {
    const query = buildQuery(params);
    return fetchApi(`/client-profile/explorer-posts/public-feed/${query}`, { skipAuth: true });
}
export function getExplorerPostsByProfile(profileId) {
    return fetchApi(`/client-profile/explorer-posts/by-profile/${profileId}/`);
}
export function addExplorerPostView(id) {
    return fetchApi(`/client-profile/explorer-posts/${id}/view/`, { method: 'POST' });
}
export function likeExplorerPost(id) {
    return fetchApi(`/client-profile/explorer-posts/${id}/like/`, { method: 'POST' });
}
export function unlikeExplorerPost(id) {
    return fetchApi(`/client-profile/explorer-posts/${id}/unlike/`, { method: 'POST' });
}
export function createExplorerPost(data) {
    const body = data instanceof FormData ? data : JSON.stringify(data);
    return fetchApi('/client-profile/explorer-posts/', { method: 'POST', body });
}
// ============ EXPLORER ONBOARDING ============
export function getExplorerOnboardingProfile() {
    return fetchApi('/client-profile/explorer/onboarding/me/');
}
export function updateExplorerOnboardingProfile(data) {
    return fetchApi('/client-profile/explorer/onboarding/me/', {
        method: 'PATCH',
        body: data instanceof FormData ? data : JSON.stringify(data),
    });
}
export function createExplorerOnboardingProfile(data) {
    return fetchApi('/client-profile/explorer/onboarding/me/', {
        method: 'POST',
        body: data instanceof FormData ? data : JSON.stringify(data),
    });
}
export function updateExplorerPost(id, data) {
    const body = data instanceof FormData ? data : JSON.stringify(data);
    return fetchApi(`/client-profile/explorer-posts/${id}/`, { method: 'PATCH', body });
}
export function deleteExplorerPost(id) {
    return fetchApi(`/client-profile/explorer-posts/${id}/`, { method: 'DELETE' });
}
// ============ RATINGS ============
export function getRatings(params) {
    const query = buildQuery(params);
    return fetchApi(`/client-profile/ratings/${query}`);
}
export function createRating(data) {
    return fetchApi('/client-profile/ratings/', { method: 'POST', body: JSON.stringify(data) });
}
export function getRatingsSummary(params) {
    const query = buildQuery(params);
    return fetchApi(`/client-profile/ratings/summary/${query}`);
}
export function getMyRatings(params) {
    const query = buildQuery(params);
    return fetchApi(`/client-profile/ratings/mine/${query}`);
}
export function getPendingRatings() {
    return fetchApi('/client-profile/ratings/pending/');
}
export async function fetchRatingsSummaryService(params) {
    const data = await getRatingsSummary({
        target_type: params.targetType,
        target_id: params.targetId,
    });
    return mapShiftRatingSummary(data);
}
export async function fetchRatingsPageService(params) {
    const data = await getRatings({
        target_type: params.targetType,
        target_id: params.targetId,
        page: params.page,
    });
    return toPaginatedList(data, mapShiftRatingComment);
}
export async function fetchMyRatingForTargetService(params) {
    const data = await getMyRatings({
        target_type: params.targetType,
        target_id: params.targetId,
    });
    const list = asList(data);
    if (list.length > 0) {
        return mapShiftRatingComment(list[0]);
    }
    if (data && typeof data === 'object' && 'id' in data) {
        return mapShiftRatingComment(data);
    }
    return null;
}
export async function createRatingService(payload) {
    const data = await createRating(payload);
    return mapShiftRatingComment(data);
}
// ============ HUB ============
// ============ DASHBOARDS ============
export function getOwnerDashboard(params) {
    const query = buildQuery(params);
    return fetchApi(`/client-profile/dashboard/owner/${query}`);
}
export function getPharmacistDashboard(params) {
    const query = buildQuery(params);
    return fetchApi(`/client-profile/dashboard/pharmacist/${query}`);
}
export function getOtherStaffDashboard(params) {
    const query = buildQuery(params);
    return fetchApi(`/client-profile/dashboard/otherstaff/${query}`);
}
export function getExplorerDashboard() {
    return fetchApi('/client-profile/dashboard/explorer/');
}
// ============ HUB ============
export function getHubContext() {
    return fetchApi('/client-profile/hub/context/');
}
export function getHubGroups(params) {
    const query = buildQuery(params);
    return fetchApi(`/client-profile/hub/groups/${query}`);
}
export function getHubGroupDetail(id, includeMembers) {
    const params = includeMembers ? '?include_members=true' : '';
    return fetchApi(`/client-profile/hub/groups/${id}/${params}`);
}
export function createHubGroup(data) {
    return fetchApi('/client-profile/hub/groups/', { method: 'POST', body: JSON.stringify(data) });
}
export function updateHubGroup(id, data) {
    return fetchApi(`/client-profile/hub/groups/${id}/`, { method: 'PATCH', body: JSON.stringify(data) });
}
export function deleteHubGroup(id) {
    return fetchApi(`/client-profile/hub/groups/${id}/`, { method: 'DELETE' });
}
export function getHubPosts(params) {
    const query = buildQuery(params);
    return fetchApi(`/client-profile/hub/posts/${query}`);
}
export function getHubPostDetail(id) {
    return fetchApi(`/client-profile/hub/posts/${id}/`);
}
export function createHubPost(data) {
    return fetchApi('/client-profile/hub/posts/', { method: 'POST', body: data instanceof FormData ? data : JSON.stringify(data) });
}
export function updateHubPost(id, data) {
    return fetchApi(`/client-profile/hub/posts/${id}/`, { method: 'PATCH', body: data instanceof FormData ? data : JSON.stringify(data) });
}
export function deleteHubPost(id) {
    return fetchApi(`/client-profile/hub/posts/${id}/`, { method: 'DELETE' });
}
export function pinHubPost(id) {
    return fetchApi(`/client-profile/hub/posts/${id}/pin/`, { method: 'POST' });
}
export function unpinHubPost(id) {
    return fetchApi(`/client-profile/hub/posts/${id}/unpin/`, { method: 'POST' });
}
export function getHubPostComments(postId) {
    return fetchApi(`/client-profile/hub/posts/${postId}/comments/`);
}
export function createHubComment(postId, data) {
    return fetchApi(`/client-profile/hub/posts/${postId}/comments/`, { method: 'POST', body: JSON.stringify(data) });
}
export function updateHubComment(postId, commentId, data) {
    return fetchApi(`/client-profile/hub/posts/${postId}/comments/${commentId}/`, { method: 'PATCH', body: JSON.stringify(data) });
}
export function deleteHubComment(postId, commentId) {
    return fetchApi(`/client-profile/hub/posts/${postId}/comments/${commentId}/`, { method: 'DELETE' });
}
export function reactToHubPost(postId, reaction) {
    return fetchApi(`/client-profile/hub/posts/${postId}/reactions/`, {
        method: 'POST',
        body: JSON.stringify({ reaction_type: reaction }),
    });
}
export function removeHubPostReaction(postId) {
    return fetchApi(`/client-profile/hub/posts/${postId}/reactions/`, { method: 'DELETE' });
}
export function reactToHubComment(postId, commentId, reaction) {
    return fetchApi(`/client-profile/hub/posts/${postId}/comments/${commentId}/reactions/`, {
        method: 'POST',
        body: JSON.stringify({ reaction_type: reaction }),
    });
}
export function removeHubCommentReaction(postId, commentId) {
    return fetchApi(`/client-profile/hub/posts/${postId}/comments/${commentId}/reactions/`, { method: 'DELETE' });
}
export function getHubPolls(params) {
    const query = buildQuery(params);
    return fetchApi(`/client-profile/hub/polls/${query}`);
}
export function getHubPollDetail(id) {
    return fetchApi(`/client-profile/hub/polls/${id}/`);
}
export function createHubPoll(data) {
    return fetchApi('/client-profile/hub/polls/', { method: 'POST', body: JSON.stringify(data) });
}
export function voteOnHubPoll(id, optionId) {
    return fetchApi(`/client-profile/hub/polls/${id}/vote/`, {
        method: 'POST',
        body: JSON.stringify({ option_id: optionId }),
    });
}
export function getHubPollComments(pollId) {
    return fetchApi(`/client-profile/hub/polls/${pollId}/comments/`);
}
export function createHubPollComment(pollId, data) {
    return fetchApi(`/client-profile/hub/polls/${pollId}/comments/`, { method: 'POST', body: JSON.stringify(data) });
}
export function updateHubPollComment(pollId, commentId, data) {
    return fetchApi(`/client-profile/hub/polls/${pollId}/comments/${commentId}/`, { method: 'PATCH', body: JSON.stringify(data) });
}
export function deleteHubPollComment(pollId, commentId) {
    return fetchApi(`/client-profile/hub/polls/${pollId}/comments/${commentId}/`, { method: 'DELETE' });
}
export function reactToHubPoll(pollId, reaction) {
    return fetchApi(`/client-profile/hub/polls/${pollId}/reactions/`, {
        method: 'POST',
        body: JSON.stringify({ reaction_type: reaction }),
    });
}
export function removeHubPollReaction(pollId) {
    return fetchApi(`/client-profile/hub/polls/${pollId}/reactions/`, { method: 'DELETE' });
}
export function updateHubPoll(id, data) {
    return fetchApi(`/client-profile/hub/polls/${id}/`, { method: 'PATCH', body: JSON.stringify(data) });
}
export function deleteHubPoll(id) {
    return fetchApi(`/client-profile/hub/polls/${id}/`, { method: 'DELETE' });
}
export function updatePharmacyHubProfile(id, data) {
    return fetchApi(`/client-profile/hub/pharmacies/${id}/profile/`, { method: 'PATCH', body: data });
}
export function updateOrganizationHubProfile(id, data) {
    return fetchApi(`/client-profile/hub/organizations/${id}/profile/`, { method: 'PATCH', body: data });
}
const mapUserSummary = (api) => {
    if (!api)
        return null;
    return {
        id: api.id,
        username: api.username ?? null,
        firstName: api.first_name,
        lastName: api.last_name,
        email: api.email,
        profilePhotoUrl: api.profile_photo_url ?? null,
    };
};
const mapAttachment = (api) => ({
    id: api.id,
    kind: api.kind,
    url: api.url,
    filename: api.filename,
    uploadedAt: api.uploaded_at,
});
const mapTaggedMember = (api) => ({
    membershipId: api.membership_id,
    fullName: api.full_name,
    email: api.email,
    role: api.role,
    jobTitle: api.job_title ?? null,
});
const mapMembership = (api) => ({
    id: api.id,
    role: api.role,
    employmentType: api.employment_type,
    jobTitle: api.job_title ?? null,
    userDetails: {
        id: api.user_details.id,
        username: api.user_details.username ?? null,
        firstName: api.user_details.first_name,
        lastName: api.user_details.last_name,
        email: api.user_details.email,
        profilePhotoUrl: api.user_details.profile_photo_url ?? null,
    },
    user: mapUserSummary(api.user_details) ?? {
        id: api.user_details.id,
        username: api.user_details.username ?? null,
        firstName: api.user_details.first_name,
        lastName: api.user_details.last_name,
        email: api.user_details.email,
        profilePhotoUrl: api.user_details.profile_photo_url ?? null,
    },
});
const mapComment = (api) => ({
    id: api.id,
    postId: api.post,
    body: api.body,
    createdAt: api.created_at,
    updatedAt: api.updated_at,
    deletedAt: api.deleted_at,
    canEdit: api.can_edit,
    parentCommentId: api.parent_comment,
    author: mapMembership(api.author),
    isEdited: api.is_edited,
    originalBody: api.original_body,
    editedAt: api.edited_at,
    editedBy: mapUserSummary(api.edited_by),
    isDeleted: api.is_deleted,
    reactionSummary: api.reaction_summary ?? undefined,
    viewerReaction: api.viewer_reaction ?? null,
});
const mapPost = (api) => ({
    id: api.id,
    pharmacyId: api.pharmacy,
    pharmacyName: api.pharmacy_name,
    communityGroupId: api.community_group,
    communityGroupName: api.community_group_name,
    organizationId: api.organization,
    organizationName: api.organization_name,
    platformHub: api.platform_hub ?? null,
    scopeType: (api.scope_type ?? 'pharmacy'),
    scopeTargetId: api.scope_target_id,
    body: api.body,
    visibility: api.visibility,
    allowComments: api.allow_comments,
    createdAt: api.created_at,
    updatedAt: api.updated_at,
    deletedAt: api.deleted_at,
    commentCount: api.comment_count,
    reactionSummary: api.reaction_summary,
    viewerReaction: api.viewer_reaction ?? null,
    author: mapMembership(api.author),
    recentComments: (api.recent_comments ?? []).map(mapComment),
    attachments: (api.attachments ?? []).map(mapAttachment),
    isEdited: api.is_edited,
    isPinned: api.is_pinned,
    pinnedAt: api.pinned_at,
    pinnedBy: mapUserSummary(api.pinned_by),
    originalBody: api.original_body,
    editedAt: api.edited_at,
    editedBy: mapUserSummary(api.edited_by),
    viewerIsAdmin: api.viewer_is_admin,
    isDeleted: api.is_deleted,
    taggedMembers: (api.tagged_members ?? []).map(mapTaggedMember),
    canManage: api.can_manage ?? false,
});
const mapPollOption = (api) => ({
    id: api.id,
    label: api.label,
    voteCount: api.vote_count,
    percentage: api.percentage,
    position: api.position,
});
const mapPoll = (api) => ({
    id: api.id,
    question: api.question,
    pharmacyId: api.pharmacy,
    organizationId: api.organization,
    communityGroupId: api.community_group,
    platformHub: api.platform_hub ?? null,
    scopeType: (api.scope_type ?? 'pharmacy'),
    options: (api.options ?? []).map(mapPollOption),
    totalVotes: api.total_votes,
    hasVoted: api.has_voted,
    selectedOptionId: api.selected_option_id,
    canVote: api.can_vote,
    canManage: api.can_manage ?? false,
    author: mapMembership(api.author ?? api.created_by),
    commentCount: api.comment_count ?? 0,
    reactionSummary: api.reaction_summary ?? {},
    viewerReaction: api.viewer_reaction ?? null,
    recentComments: (api.recent_comments ?? []).map(mapComment),
    createdAt: api.created_at,
    updatedAt: api.updated_at,
    closesAt: api.closes_at,
    isClosed: api.is_closed,
});
const mapPharmacy = (api) => ({
    id: api.id,
    name: api.name,
    about: api.about,
    coverImageUrl: api.cover_image_url,
    organizationId: api.organization_id,
    organizationName: api.organization_name,
    canManageProfile: api.can_manage_profile,
    canCreateGroup: api.can_create_group,
    canCreatePost: api.can_create_post,
});
const mapOrganization = (api) => ({
    id: api.id,
    name: api.name,
    about: api.about,
    coverImageUrl: api.cover_image_url,
    canManageProfile: api.can_manage_profile,
    isOrgAdmin: api.is_org_admin,
    memberCount: api.member_count ?? 0,
});
const mapGroupMember = (api) => ({
    membershipId: api.membership_id,
    member: mapMembership(api.member),
    isAdmin: api.is_admin,
    joinedAt: api.joined_at,
    pharmacyId: api.pharmacy_id ?? null,
    pharmacyName: api.pharmacy_name ?? null,
    jobTitle: api.job_title ?? null,
});
const mapGroup = (api) => ({
    id: api.id,
    pharmacyId: api.pharmacy,
    pharmacyName: api.pharmacy_name,
    organizationId: api.organization_id,
    name: api.name,
    description: api.description,
    memberCount: api.member_count,
    isAdmin: api.is_admin,
    isMember: api.is_member,
    isCreator: api.is_creator,
    members: api.members ? api.members.map(mapGroupMember) : undefined,
});
const mapContext = (api) => ({
    pharmacies: (api.pharmacies ?? []).map(mapPharmacy),
    organizations: (api.organizations ?? []).map(mapOrganization),
    communityGroups: (api.community_groups ?? []).map(mapGroup),
    organizationGroups: (api.organization_groups ?? []).map(mapGroup),
    chemisttaskerHubs: (api.chemisttasker_hubs ?? []).map((hub) => ({
        key: hub.key,
        label: hub.label,
        audienceType: hub.audience_type,
    })),
    defaultPharmacyId: api.default_pharmacy_id,
    defaultOrganizationId: api.default_organization_id,
});
const buildScopeParams = (scope) => {
    const params = { scope: scope.type };
    if (scope.type === 'pharmacy') {
        params.pharmacy_id = scope.id;
    }
    else if (scope.type === 'organization') {
        params.organization_id = scope.id;
    }
    else if (scope.type === 'group') {
        params.group_id = scope.id;
    }
    else if (scope.type === 'platform') {
        params.platform_hub = scope.id;
    }
    return params;
};
const buildPostFormData = (payload, scope) => {
    const hasFiles = payload.attachments && payload.attachments.length > 0;
    if (!hasFiles) {
        const plain = {};
        if (payload.body !== undefined)
            plain.body = payload.body;
        if (payload.visibility)
            plain.visibility = payload.visibility;
        if (payload.allowComments !== undefined) {
            plain.allow_comments = payload.allowComments;
        }
        if (payload.removeAttachmentIds?.length) {
            plain.remove_attachment_ids = payload.removeAttachmentIds;
        }
        if (payload.taggedMemberIds) {
            plain.tagged_member_ids = payload.taggedMemberIds;
        }
        if (scope) {
            Object.assign(plain, buildScopeParams(scope));
        }
        return { data: plain, isMultipart: false };
    }
    const formData = new FormData();
    if (payload.body !== undefined)
        formData.append('body', payload.body);
    if (payload.visibility)
        formData.append('visibility', payload.visibility);
    if (payload.allowComments !== undefined) {
        formData.append('allow_comments', String(payload.allowComments));
    }
    payload.attachments?.forEach(file => formData.append('attachments', file));
    payload.removeAttachmentIds?.forEach(id => formData.append('remove_attachment_ids', String(id)));
    payload.taggedMemberIds?.forEach(id => formData.append('tagged_member_ids', String(id)));
    if (scope) {
        const scopeParams = buildScopeParams(scope);
        Object.entries(scopeParams).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                formData.append(key, String(value));
            }
        });
    }
    return { data: formData, isMultipart: true };
};
const mapOptionFromSource = (source) => ({
    membershipId: source.membershipId,
    userId: source.userId ?? null,
    fullName: source.fullName,
    email: source.email,
    role: source.role ?? 'MEMBER',
    employmentType: source.employmentType,
    pharmacyId: source.pharmacyId,
    pharmacyName: source.pharmacyName,
    jobTitle: source.jobTitle ?? null,
    profilePhotoUrl: source.profilePhotoUrl ?? null,
});

const isEmailLike = (value) => typeof value === 'string' && value.includes('@');

const memberDisplayName = (member, membershipId) => {
    const details = member.user_details ?? member.userDetails ?? member.user ?? {};
    const composed = `${details.first_name ?? details.firstName ?? ''} ${details.last_name ?? details.lastName ?? ''}`.trim();
    const candidates = [
        details.full_name,
        details.fullName,
        composed,
        member.invited_name,
        member.invitedName,
        member.name,
        details.username,
    ];
    for (const candidate of candidates) {
        const value = typeof candidate === 'string' ? candidate.trim() : '';
        if (value && !isEmailLike(value)) {
            return value;
        }
    }
    return `Member ${membershipId ?? member.id ?? ''}`.trim();
};

const groupMemberDisplayName = (member) => {
    const details = member.member?.userDetails ?? member.member?.user_details ?? {};
    const composed = `${details.firstName ?? details.first_name ?? ''} ${details.lastName ?? details.last_name ?? ''}`.trim();
    const candidates = [
        details.fullName,
        details.full_name,
        composed,
        member.member?.invitedName,
        member.member?.invited_name,
        details.username,
    ];
    for (const candidate of candidates) {
        const value = typeof candidate === 'string' ? candidate.trim() : '';
        if (value && !isEmailLike(value)) {
            return value;
        }
    }
    return `Member ${member.membership_id ?? member.membershipId ?? ''}`.trim();
};

export async function fetchHubContext() {
    const response = await getHubContext();
    return mapContext(response);
}
export async function fetchHubPosts(scope, options = {}) {
    let data;
    if (options.cursor) {
        data = await fetchWithAuth(options.cursor);
    }
    else {
        const params = { ...buildScopeParams(scope) };
        data = (await getHubPosts(params));
    }
    const posts = asList(data).map(mapPost);
    return { posts, next: extractNext(data) };
}
export async function fetchHubPost(postId) {
    const data = await getHubPostDetail(postId);
    return mapPost(data);
}
export async function fetchHubPolls(scope) {
    const params = buildScopeParams(scope);
    const data = await getHubPolls(params);
    return asList(data).map(mapPoll);
}
export async function createHubPollService(scope, payload) {
    const body = {
        question: payload.question,
        options: payload.options,
        ...buildScopeParams(scope),
    };
    const data = await createHubPoll(body);
    return mapPoll(data);
}
export async function fetchHubPollComments(pollId) {
    const data = await getHubPollComments(pollId);
    return asList(data).map(mapComment);
}
export async function createHubPollCommentService(pollId, payload) {
    const data = await createHubPollComment(pollId, {
        body: payload.body,
    });
    return mapComment(data);
}
export async function updateHubPollCommentService(pollId, commentId, payload) {
    const data = await updateHubPollComment(pollId, commentId, { body: payload.body });
    return mapComment(data);
}
export async function deleteHubPollCommentService(pollId, commentId) {
    await deleteHubPollComment(pollId, commentId);
}
export async function voteHubPollService(pollId, optionId) {
    const data = await voteOnHubPoll(pollId, optionId);
    return mapPoll(data);
}
export async function reactToHubPollService(pollId, reaction) {
    const data = await reactToHubPoll(pollId, reaction);
    return mapPoll(data);
}
export async function removeHubPollReactionService(pollId) {
    const data = await removeHubPollReaction(pollId);
    return mapPoll(data);
}
export async function updateHubPollService(pollId, payload) {
    const body = {};
    if (payload.question !== undefined)
        body.question = payload.question;
    if (payload.options)
        body.options = payload.options;
    const data = await updateHubPoll(pollId, body);
    return mapPoll(data);
}
export async function deleteHubPollService(pollId) {
    await deleteHubPoll(pollId);
}
export async function createHubPostService(scope, payload) {
    const { data, isMultipart } = buildPostFormData(payload, scope);
    // Avoid double stringification: createHubPost will JSON.stringify non-FormData bodies.
    const response = await createHubPost(isMultipart ? data : data);
    return mapPost(response);
}
export async function updateHubPostService(postId, payload) {
    const { data, isMultipart } = buildPostFormData(payload);
    // Avoid double stringification: updateHubPost will JSON.stringify non-FormData bodies.
    const response = await updateHubPost(postId, isMultipart ? data : data);
    return mapPost(response);
}
export async function deleteHubPostService(postId) {
    await deleteHubPost(postId);
}
export async function pinHubPostService(postId) {
    const data = await pinHubPost(postId);
    return mapPost(data);
}
export async function unpinHubPostService(postId) {
    const data = await unpinHubPost(postId);
    return mapPost(data);
}
export async function fetchHubComments(postId) {
    const data = await getHubPostComments(postId);
    return asList(data).map(mapComment);
}
export async function createHubCommentService(postId, payload) {
    const data = await createHubComment(postId, {
        body: payload.body,
        parent_comment: payload.parentComment ?? null,
    });
    return mapComment(data);
}
export async function updateHubCommentService(postId, commentId, payload) {
    const body = {};
    if (payload.body !== undefined)
        body.body = payload.body;
    if (payload.parentComment !== undefined)
        body.parent_comment = payload.parentComment;
    const data = await updateHubComment(postId, commentId, body);
    return mapComment(data);
}
export async function deleteHubCommentService(postId, commentId) {
    await deleteHubComment(postId, commentId);
}
export async function reactToHubCommentService(postId, commentId, reaction) {
    const data = await reactToHubComment(postId, commentId, reaction);
    return mapComment(data);
}
export async function removeHubCommentReactionService(postId, commentId) {
    const data = await removeHubCommentReaction(postId, commentId);
    return mapComment(data);
}
export async function reactToHubPostService(postId, reaction) {
    const data = await reactToHubPost(postId, reaction);
    return mapPost(data);
}
export async function removeHubReaction(postId) {
    await removeHubPostReaction(postId);
}
export async function createHubGroupService(payload) {
    const body = {
        pharmacy_id: payload.pharmacyId,
        name: payload.name,
    };
    if (payload.organizationId !== undefined)
        body.organization_id = payload.organizationId;
    if (payload.description !== undefined)
        body.description = payload.description;
    if (payload.memberIds?.length)
        body.member_ids = payload.memberIds;
    const data = await createHubGroup(body);
    return mapGroup(data);
}
export async function fetchHubGroup(groupId, options) {
    const data = await getHubGroupDetail(groupId, options?.includeMembers);
    return mapGroup(data);
}
export async function updateHubGroupService(groupId, payload, options) {
    const body = {};
    if (payload.pharmacyId !== undefined)
        body.pharmacy_id = payload.pharmacyId;
    if (payload.organizationId !== undefined)
        body.organization_id = payload.organizationId;
    if (payload.name !== undefined)
        body.name = payload.name;
    if (payload.description !== undefined)
        body.description = payload.description;
    if (payload.memberIds !== undefined)
        body.member_ids = payload.memberIds;
    const data = await updateHubGroup(groupId, body);
    if (options?.includeMembers) {
        return fetchHubGroup(groupId, { includeMembers: true });
    }
    return mapGroup(data);
}
export async function deleteHubGroupService(groupId) {
    await deleteHubGroup(groupId);
}
export async function updatePharmacyHubProfileService(pharmacyId, payload) {
    const formData = new FormData();
    if (payload.about !== undefined)
        formData.append('about', payload.about ?? '');
    if (payload.coverImage)
        formData.append('cover_image', payload.coverImage);
    const data = await updatePharmacyHubProfile(pharmacyId, formData);
    return mapPharmacy(data);
}
export async function updateOrganizationHubProfileService(organizationId, payload) {
    const formData = new FormData();
    if (payload.about !== undefined)
        formData.append('about', payload.about ?? '');
    if (payload.coverImage)
        formData.append('cover_image', payload.coverImage);
    const data = await updateOrganizationHubProfile(organizationId, formData);
    return mapOrganization(data);
}
export async function fetchPharmacyGroupMembers(pharmacyId) {
    const data = await fetchApi(`/client-profile/memberships/?pharmacy=${pharmacyId}`);
    return asList(data)
        .filter(member => ['FULL_TIME', 'PART_TIME', 'CASUAL'].includes(member.employment_type ?? member.employmentType ?? ''))
        .map(member => mapOptionFromSource({
            membershipId: member.id,
            userId: member.user,
            fullName: memberDisplayName(member, member.id),
            email: member.user_details?.email ?? null,
            role: member.role ?? null,
            employmentType: member.employment_type ?? null,
            pharmacyId: pharmacyId,
            pharmacyName: member.pharmacy_name ?? null,
            jobTitle: member.job_title ?? null,
            profilePhotoUrl: member.user_details?.profile_photo_url ?? null,
        }));
}
export async function fetchOrganizationGroupMembers(organizationId) {
    const data = await getHubGroups({ organization_id: organizationId, include_pharmacy_members: true });
    return asList(data)
        .flatMap(group => group.members ?? [])
        .map(member => mapOptionFromSource({
            membershipId: member.membership_id,
            userId: member.member?.userDetails.id ?? null,
            fullName: groupMemberDisplayName(member),
            email: member.member?.userDetails.email ?? null,
            role: member.member?.role ?? null,
            employmentType: member.member?.employmentType ?? null,
            pharmacyId: member.pharmacy_id ?? null,
            pharmacyName: member.pharmacy_name ?? null,
            jobTitle: member.job_title ?? null,
        }));
}
// Organization members: org staff + all pharmacy members under the org.
export async function fetchOrganizationMembers(organizationId) {
    const data = await fetchApi(`/client-profile/memberships/?organization=${organizationId}&page_size=500`);
    const list = asList(data.results ?? data);
    return list.filter(member => ['FULL_TIME', 'PART_TIME', 'CASUAL'].includes(member.employment_type ?? member.employmentType ?? '')).map((member) => mapOptionFromSource({
        membershipId: member.id,
        userId: member.user_details?.id ?? null,
        fullName: memberDisplayName(member, member.id),
        email: member.user_details?.email ?? null,
        role: member.role ?? null,
        employmentType: member.employment_type ?? null,
        pharmacyId: member.pharmacy_detail?.id ?? null,
        pharmacyName: member.pharmacy_detail?.name ?? null,
        jobTitle: member.job_title ?? null,
        profilePhotoUrl: member.user_details?.profile_photo_url ?? null,
    }));
}
export async function fetchHubGroupMembers(groupId) {
    const group = await fetchHubGroup(groupId, { includeMembers: true });
    return (group.members ?? []).map(member => mapOptionFromSource({
        membershipId: member.membershipId,
        userId: member.member.userDetails.id,
        fullName: groupMemberDisplayName(member),
        email: member.member.userDetails.email,
        role: member.member.role,
        employmentType: member.member.employmentType,
        pharmacyId: member.pharmacyId ?? group.pharmacyId ?? null,
        pharmacyName: member.pharmacyName ?? group.pharmacyName ?? null,
        jobTitle: member.jobTitle ?? null,
    }));
}
// ============ CHAT/ROOMS ============
export function getRooms() {
    return fetchApi('/client-profile/rooms/');
}
export function getRoomDetail(id) {
    return fetchApi(`/client-profile/rooms/${id}/`);
}
export function getRoomMessages(id) {
    return fetchApi(`/client-profile/rooms/${id}/messages/`);
}
export function sendRoomMessage(id, data) {
    return fetchApi(`/client-profile/rooms/${id}/messages/`, {
        method: 'POST',
        body: data instanceof FormData ? data : JSON.stringify(data),
    });
}
export function markRoomAsRead(id) {
    return fetchApi(`/client-profile/rooms/${id}/read/`, { method: 'POST' });
}
export function getChatParticipants() {
    return fetchApi('/client-profile/chat-participants/');
}
export function startDm(data) {
    // Debug: verify DM endpoint and payload at runtime
    // This should be hitting get-or-create-dm; if you see start-dm in the network tab, the build is stale.
    console.debug('shared-core startDm -> POST /client-profile/rooms/get-or-create-dm/', data);
    return fetchApi('/client-profile/rooms/get-or-create-dm/', { method: 'POST', body: JSON.stringify(data) });
}
export function getOrCreateGroup(data) {
    return fetchApi('/client-profile/rooms/get-or-create-group/', { method: 'POST', body: JSON.stringify(data) });
}
export function getOrCreateDmByUser(data) {
    return fetchApi('/client-profile/rooms/get-or-create-dm-by-user/', { method: 'POST', body: JSON.stringify(data) });
}
export interface ShiftContactApi {
    pharmacy_id: number | null;
    pharmacy_name: string;
    pharmacies?: Array<{ id: number; name: string }>;
    shift_id?: number | null;
    shift_date?: string | null;
    role: string;
    user: any;
}
export function fetchShiftContacts() {
    return fetchApi('/client-profile/rooms/shift-contacts/');
}
export function updateMessage(messageId, data) {
    return fetchApi(`/client-profile/messages/${messageId}/`, { method: 'PATCH', body: JSON.stringify(data) });
}
export function deleteMessage(messageId) {
    return fetchApi(`/client-profile/messages/${messageId}/`, { method: 'DELETE' });
}
export function reactToMessage(messageId, data) {
    return fetchApi(`/client-profile/messages/${messageId}/react/`, { method: 'POST', body: JSON.stringify(data) });
}
export function toggleRoomPin(roomId, data) {
    return fetchApi(`/client-profile/rooms/${roomId}/toggle-pin/`, { method: 'POST', body: JSON.stringify(data) });
}
export function deleteRoomRequest(roomId) {
    return fetchApi(`/client-profile/rooms/${roomId}/`, { method: 'DELETE' });
}
const mapChatUser = (api) => {
    const base = camelCaseKeysDeep(api);
    return {
        ...base,
        email: base.email ?? undefined,
    };
};
const mapChatMessage = (api) => ({
    id: api.id,
    conversation: api.conversation,
    sender: {
        id: api.sender.id,
        user_details: mapChatUser(api.sender.user_details),
        pharmacy: api.sender.pharmacy ?? null,
    },
    body: api.body,
    attachment_url: api.attachment_url,
    created_at: api.created_at,
    is_deleted: api.is_deleted,
    is_edited: api.is_edited,
    original_body: api.original_body ?? null,
    reactions: api.reactions?.map(reaction => ({
        reaction: reaction.reaction,
        user_id: reaction.user_id,
    })),
    attachment_filename: api.attachment_filename ?? null,
    is_pinned: api.is_pinned,
});
const mapChatRoom = (api) => ({
    id: api.id,
    type: api.type,
    title: api.title,
    pharmacy: api.pharmacy ?? null,
    unread_count: api.unread_count ?? 0,
    updated_at: api.updated_at,
    last_message: api.last_message
        ? {
            id: api.last_message.id,
            body: api.last_message.body,
            created_at: api.last_message.created_at,
            sender: api.last_message.sender,
        }
        : null,
    my_last_read_at: api.my_last_read_at ?? null,
    participant_ids: api.participant_ids,
    my_membership_id: api.my_membership_id ?? null,
    is_pinned: api.is_pinned,
    pinned_message: api.pinned_message ? mapChatMessage(api.pinned_message) : null,
});
const mapChatParticipantRecord = (api) => ({
    id: api.id,
    userDetails: mapChatUser(api.user_details ?? {}),
    role: api.role ?? undefined,
    employmentType: api.employment_type ?? undefined,
    invitedName: api.invited_name ?? undefined,
    isAdmin: api.is_admin ?? false,
});
export async function fetchRooms() {
    const data = await getRooms();
    const list = Array.isArray(data?.results)
        ? data.results
        : Array.isArray(data)
            ? data
            : [];
    return list.map(mapChatRoom);
}
export async function fetchRoom(roomId) {
    const data = await getRoomDetail(roomId);
    return mapChatRoom(data);
}
export async function fetchRoomMessagesService(roomId) {
    const data = await getRoomMessages(roomId);
    const list = Array.isArray(data?.results)
        ? data.results
        : Array.isArray(data)
            ? data
            : [];
    return {
        messages: list.map(mapChatMessage),
        next: data?.next ?? null,
    };
}
export async function fetchRoomMessagesByUrl(url) {
    const data = await fetchApi(url);
    const list = Array.isArray(data?.results)
        ? data.results
        : Array.isArray(data)
            ? data
            : [];
    return {
        messages: list.map(mapChatMessage),
        next: data?.next ?? null,
    };
}
export async function sendRoomMessageService(roomId, payload) {
    const data = await sendRoomMessage(roomId, payload);
    return mapChatMessage(data);
}
export async function markRoomAsReadService(roomId) {
    const data = await markRoomAsRead(roomId);
    return data?.last_read_at ?? null;
}
export async function startDirectMessageByMembership(participantMembershipId, pharmacyId) {
    const data = await startDm({
        partner_membership_id: participantMembershipId,
    });
    return mapChatRoom(data);
}
export async function createOrUpdateGroupRoom(payload) {
    const body = {
        room_id: payload.roomId,
        title: payload.title,
        participant_ids: payload.participants,
    };
    const data = await getOrCreateGroup(body);
    return mapChatRoom(data);
}
export async function getOrCreatePharmacyGroup(pharmacyId) {
    const data = await getOrCreateGroup({ pharmacy_id: pharmacyId });
    return mapChatRoom(data);
}
export async function startDirectMessageByUser(partnerUserId) {
    const data = await getOrCreateDmByUser({ partner_user_id: partnerUserId });
    return mapChatRoom(data);
}
export async function fetchChatParticipants() {
    const data = await getChatParticipants();
    const list = Array.isArray(data?.results)
        ? data.results
        : Array.isArray(data)
            ? data
            : [];
    return list.map(mapChatParticipantRecord);
}
export async function fetchRoomMessages(nextUrl) {
    return fetchRoomMessagesByUrl(nextUrl);
}
export async function updateMessageService(messageId, body) {
    const data = await updateMessage(messageId, { body });
    return mapChatMessage(data);
}
export async function deleteMessageService(messageId) {
    await deleteMessage(messageId);
}
export async function reactToMessageService(messageId, reaction) {
    const data = await reactToMessage(messageId, { reaction });
    return mapChatMessage(data);
}
export async function deleteRoomService(roomId) {
    await deleteRoomRequest(roomId);
}
export async function toggleRoomPinService(roomId, payload) {
    // Normalize camelCase to the API's expected snake_case
    const body = { target: payload?.target };
    if (payload?.message_id !== undefined) {
        body['message_id'] = payload.message_id;
    }
    if (payload?.messageId !== undefined) {
        body['message_id'] = payload.messageId;
    }
    const data = await toggleRoomPin(roomId, body);
    return mapChatRoom(data);
}



// ============ CALENDAR & WORK NOTES ============

export interface CalendarEventFilters {
    pharmacyId?: number;
    organizationId?: number;
    dateFrom?: string;
    dateTo?: string;
    source?: string;
}

export interface WorkNoteFilters {
    pharmacyId?: number;
    dateFrom?: string;
    dateTo?: string;
    status?: string;
    assignedToMe?: boolean;
}

const mapCalendarEvent = (api: any) => ({
    id: api.id,
    pharmacy: api.pharmacy,
    organization: api.organization,
    title: api.title,
    description: api.description,
    date: api.date,
    startTime: api.start_time,
    endTime: api.end_time,
    allDay: api.all_day ?? true,
    source: api.source,
    sourceDisplay: api.source_display,
    sourceMembership: api.source_membership,
    isReadOnly: api.is_read_only ?? false,
    createdBy: api.created_by,
    createdByName: api.created_by_name,
    createdAt: api.created_at,
    updatedAt: api.updated_at,
});

const mapWorkNoteAssignee = (api: any) => ({
    id: api.id,
    membershipId: api.membership_id,
    userId: api.user_id,
    userName: api.user_name,
    notifiedAt: api.notified_at,
    createdAt: api.created_at,
});

const mapWorkNote = (api: any) => ({
    id: api.id,
    pharmacy: api.pharmacy,
    date: api.date,
    title: api.title,
    body: api.body,
    status: api.status,
    notifyOnShiftStart: api.notify_on_shift_start ?? false,
    isGeneral: api.is_general ?? false,
    assignees: ensureArray(api.assignees).map(mapWorkNoteAssignee),
    createdBy: api.created_by,
    createdByName: api.created_by_name,
    createdAt: api.created_at,
    updatedAt: api.updated_at,
});

// Calendar Events
export function getCalendarEvents(params: CalendarEventFilters) {
    const query = buildQuery({
        pharmacy_id: params.pharmacyId,
        organization_id: params.organizationId,
        date_from: params.dateFrom,
        date_to: params.dateTo,
        source: params.source,
    });
    return fetchApi(`/client-profile/calendar-events/${query}`);
}

export async function fetchCalendarEvents(params: CalendarEventFilters) {
    const data = await getCalendarEvents(params);
    return asList(data).map(mapCalendarEvent);
}

export function getCalendarEventDetail(id: number) {
    return fetchApi(`/client-profile/calendar-events/${id}/`);
}

export async function fetchCalendarEventDetail(id: number) {
    const data = await getCalendarEventDetail(id);
    return mapCalendarEvent(data);
}

export function createCalendarEvent(payload: {
    pharmacy?: number;
    organization?: number;
    title: string;
    description?: string;
    date: string;
    startTime?: string;
    endTime?: string;
    allDay?: boolean;
}) {
    return fetchApi('/client-profile/calendar-events/', {
        method: 'POST',
        body: JSON.stringify({
            pharmacy: payload.pharmacy,
            organization: payload.organization,
            title: payload.title,
            description: payload.description,
            date: payload.date,
            start_time: payload.startTime,
            end_time: payload.endTime,
            all_day: payload.allDay ?? true,
        }),
    });
}

export async function createCalendarEventService(payload: Parameters<typeof createCalendarEvent>[0]) {
    const data = await createCalendarEvent(payload);
    return mapCalendarEvent(data);
}

export function updateCalendarEvent(id: number, payload: Partial<Parameters<typeof createCalendarEvent>[0]>) {
    return fetchApi(`/client-profile/calendar-events/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify({
            title: payload.title,
            description: payload.description,
            date: payload.date,
            start_time: payload.startTime,
            end_time: payload.endTime,
            all_day: payload.allDay,
        }),
    });
}

export async function updateCalendarEventService(id: number, payload: Parameters<typeof updateCalendarEvent>[1]) {
    const data = await updateCalendarEvent(id, payload);
    return mapCalendarEvent(data);
}

export function deleteCalendarEvent(id: number) {
    return fetchApi(`/client-profile/calendar-events/${id}/`, { method: 'DELETE' });
}

export async function deleteCalendarEventService(id: number) {
    await deleteCalendarEvent(id);
}

// Work Notes
export function getWorkNotes(params: WorkNoteFilters) {
    const query = buildQuery({
        pharmacy_id: params.pharmacyId,
        date_from: params.dateFrom,
        date_to: params.dateTo,
        status: params.status,
        assigned_to_me: params.assignedToMe ? 'true' : undefined,
    });
    return fetchApi(`/client-profile/work-notes/${query}`);
}

export async function fetchWorkNotes(params: WorkNoteFilters) {
    const data = await getWorkNotes(params);
    return asList(data).map(mapWorkNote);
}

export function getWorkNoteDetail(id: number) {
    return fetchApi(`/client-profile/work-notes/${id}/`);
}

export async function fetchWorkNoteDetail(id: number) {
    const data = await getWorkNoteDetail(id);
    return mapWorkNote(data);
}

export function createWorkNote(payload: {
    pharmacy: number;
    date: string;
    title: string;
    body?: string;
    status?: string;
    notifyOnShiftStart?: boolean;
    isGeneral?: boolean;
    assigneeMembershipIds?: number[];
}) {
    return fetchApi('/client-profile/work-notes/', {
        method: 'POST',
        body: JSON.stringify({
            pharmacy: payload.pharmacy,
            date: payload.date,
            title: payload.title,
            body: payload.body,
            status: payload.status,
            notify_on_shift_start: payload.notifyOnShiftStart ?? false,
            is_general: payload.isGeneral ?? false,
            assignee_membership_ids: payload.assigneeMembershipIds ?? [],
        }),
    });
}

export async function createWorkNoteService(payload: Parameters<typeof createWorkNote>[0]) {
    const data = await createWorkNote(payload);
    return mapWorkNote(data);
}

export function updateWorkNote(id: number, payload: Partial<Parameters<typeof createWorkNote>[0]>) {
    return fetchApi(`/client-profile/work-notes/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify({
            title: payload.title,
            body: payload.body,
            status: payload.status,
            notify_on_shift_start: payload.notifyOnShiftStart,
            is_general: payload.isGeneral,
            assignee_membership_ids: payload.assigneeMembershipIds,
        }),
    });
}

export async function updateWorkNoteService(id: number, payload: Parameters<typeof updateWorkNote>[1]) {
    const data = await updateWorkNote(id, payload);
    return mapWorkNote(data);
}

export function deleteWorkNote(id: number) {
    return fetchApi(`/client-profile/work-notes/${id}/`, { method: 'DELETE' });
}

export async function deleteWorkNoteService(id: number) {
    await deleteWorkNote(id);
}

export function markWorkNoteDone(id: number) {
    return fetchApi(`/client-profile/work-notes/${id}/mark_done/`, { method: 'POST' });
}

export async function markWorkNoteDoneService(id: number) {
    const data = await markWorkNoteDone(id);
    return mapWorkNote(data);
}

export function markWorkNoteOpen(id: number) {
    return fetchApi(`/client-profile/work-notes/${id}/mark_open/`, { method: 'POST' });
}

export async function markWorkNoteOpenService(id: number) {
    const data = await markWorkNoteOpen(id);
    return mapWorkNote(data);
}

// Calendar Feed (aggregated)
export function getCalendarFeed(params: CalendarEventFilters) {
    const query = buildQuery({
        pharmacy_id: params.pharmacyId,
        organization_id: params.organizationId,
        date_from: params.dateFrom,
        date_to: params.dateTo,
    });
    return fetchApi(`/client-profile/calendar-feed/${query}`);
}

export async function fetchCalendarFeed(params: CalendarEventFilters) {
    const data = await getCalendarFeed(params);
    return {
        events: ensureArray(data.events).map(mapCalendarEvent),
        workNotes: ensureArray(data.work_notes).map(mapWorkNote),
        dateFrom: data.date_from,
        dateTo: data.date_to,
        pharmacyId: data.pharmacy_id,
        organizationId: data.organization_id,
    };
}

// ============ BILLING ============

export function createSubscriptionCheckout(payload: { staffCount: number; paymentMethod: 'card' | 'invoice' }) {
    return fetchApi('/billing/subscribe/', {
        method: 'POST',
        body: JSON.stringify({
            staff_count: payload.staffCount,
            payment_method: payload.paymentMethod
        })
    });
}

export function getCurrentSubscription(pharmacyId?: number) {
    const query = pharmacyId ? `?pharmacy_id=${pharmacyId}` : '';
    return fetchApi(`/billing/subscription/${query}`);
}

export function updateSubscriptionSeats(payload: { staffCount: number; pharmacyId?: number }) {
    return fetchApi('/billing/subscription/seats/', {
        method: 'POST',
        body: JSON.stringify({
            staff_count: payload.staffCount,
            pharmacy_id: payload.pharmacyId
        })
    });
}

export function chargeShiftFulfillment(shiftId: number) {
    return fetchApi(`/billing/charge-fulfillment/${shiftId}/`, {
        method: 'POST'
    });
}

export function chargeShiftPenalty(shiftId: number, payload: { hours: number }) {
    return fetchApi(`/billing/charge-penalty/${shiftId}/`, {
        method: 'POST',
        body: JSON.stringify({ hours: payload.hours })
    });
}
