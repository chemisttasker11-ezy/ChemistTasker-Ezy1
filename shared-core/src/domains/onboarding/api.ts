import type { OnboardingApi } from '../../contracts/accounts';
/** Domain-owned operations extracted from the established shared API. */
import { API_ENDPOINTS } from '../../constants/endpoints';
import { fetchApi } from '../../transport/application';
export function getOnboarding(role: string) {
    const safeRole = role === 'other_staff' ? 'otherstaff' : role;
    return fetchApi<OnboardingApi>(`/${safeRole}/onboarding/me/`);
}
export function updateOnboarding(role: string, data: unknown) {
    const safeRole = role === 'other_staff' ? 'otherstaff' : role;
    const body = data instanceof FormData || typeof data === 'string' ? data : JSON.stringify(data);
    return fetchApi(`/${safeRole}/onboarding/me/`, { method: 'PATCH', body });
}
export function getOnboardingDetail(rawRole: string) {
    const safeRole = rawRole === 'other_staff' ? 'otherstaff' : rawRole;
    return fetchApi<OnboardingApi>(`/${safeRole}/onboarding/me/`);
}
export function updateOnboardingForm(rawRole: string, body: FormData) {
    const safeRole = rawRole === 'other_staff' ? 'otherstaff' : rawRole;
    return fetchApi(`/${safeRole}/onboarding/me/`, {
        method: 'PATCH',
        body,
    });
}
export function submitRefereeResponse(token: string, data: unknown) {
    return fetchApi(`/onboarding/submit-reference/${token}/`, { method: 'POST', body: JSON.stringify(data) });
}
export function refereeRejectByToken(token: string) {
    return fetchApi(API_ENDPOINTS.refereeRejectByToken(token), { method: 'POST' });
}
export function refereeReject(pk: number | string | string, refIndex: number | string) {
    return fetchApi(`/onboarding/referee-reject/${pk}/${refIndex}/`, { method: 'POST' });
}
export function getExplorerOnboardingProfile() {
    return fetchApi('/explorer/onboarding/me/');
}
export function updateExplorerOnboardingProfile(data: unknown) {
    return fetchApi('/explorer/onboarding/me/', {
        method: 'PATCH',
        body: data instanceof FormData ? data : JSON.stringify(data),
    });
}
export function createExplorerOnboardingProfile(data: unknown) {
    return fetchApi('/explorer/onboarding/me/', {
        method: 'POST',
        body: data instanceof FormData ? data : JSON.stringify(data),
    });
}

export function recheckAhpra() {
  return fetchApi<{ queued: true }>('/onboarding/ahpra/recheck/', { method: 'POST' });
}
