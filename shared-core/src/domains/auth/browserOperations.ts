/**
 * Explicit browser transport for unauthenticated and cookie-backed identity
 * journeys. Vite and Next supply their own API base; no global user/session
 * state or Next SSR cookies live in this module.
 *
 * Cross-origin public registration intentionally uses same-origin credentials,
 * matching the browser's original axios defaults. Cookie login/OTP is explicit.
 */
import { API_ENDPOINTS } from '../../constants/endpoints';
import { createApiClient, ApiError } from '../../transport/client';
import { fetchApi } from '../../transport/application';
import type { CurrentUserApi } from '../../contracts/accounts';
import type { ExplorerPostApi } from '../../types';
import type { Collection } from '../../contracts/common';

export type BrowserIdentityTransport = { baseUrl: string; fetchImpl?: typeof fetch };
type BrowserSessionResponse = { access: string; refresh?: string; user: any };
const client = (options: BrowserIdentityTransport, credentials: RequestCredentials = 'same-origin', bearer?: string | null) =>
  createApiClient({
    baseUrl: options.baseUrl,
    credentials,
    getAuthToken: bearer ? () => bearer : undefined,
    fetchImpl: options.fetchImpl,
  });
const publicRequest = { auth: false, retryAuth: false } as const;
const browserLabel = { 'X-Client-Platform': 'web' };
export async function browserCsrfToken(options: BrowserIdentityTransport): Promise<string> {
  const result = await client(options, 'include').get<{ csrfToken: string }>(
    '/users/csrf/', undefined, { ...publicRequest, headers: browserLabel },
  );
  if (!result?.csrfToken) throw new Error('Browser CSRF bootstrap did not return a token.');
  return result.csrfToken;
}
export async function browserLoginSession(
  options: BrowserIdentityTransport, payload: { email: string; password: string; remember_me: boolean },
): Promise<BrowserSessionResponse> {
  const csrf = await browserCsrfToken(options);
  return client(options, 'include').post<BrowserSessionResponse>(API_ENDPOINTS.login, payload, {
    ...publicRequest,
    headers: { ...browserLabel, 'X-CSRFToken': csrf },
  });
}
export async function browserVerifyEmailOtp(options: BrowserIdentityTransport, email: string, otp: string) {
  const csrf = await browserCsrfToken(options);
  return client(options, 'include').post(API_ENDPOINTS.verifyOtp, { email, otp }, {
    ...publicRequest, headers: { ...browserLabel, 'X-CSRFToken': csrf },
  });
}
export async function browserResendEmailOtp(options: BrowserIdentityTransport, email: string) {
  // Preserve the original resend request contract: browser cookie and platform
  // label, without injecting an unsolicited CSRF token.
  return client(options, 'include').post(API_ENDPOINTS.resendOtp, { email }, {
    ...publicRequest, headers: browserLabel,
  });
}
export async function browserRegisterAccount(options: BrowserIdentityTransport, payload: unknown) {
  return client(options).post(API_ENDPOINTS.register, payload as object, publicRequest);
}
export async function browserRequestPasswordReset(options: BrowserIdentityTransport, email: string) {
  return client(options).post(API_ENDPOINTS.passwordReset, { email }, publicRequest);
}
export async function browserSubmitReferee(
  options: BrowserIdentityTransport, invitationToken: string, payload: unknown,
) {
  return client(options).post(API_ENDPOINTS.submitRefereeResponse(invitationToken), payload as object, publicRequest);
}
export async function browserRejectReferee(
  options: BrowserIdentityTransport, candidateId: string, referenceIndex: string,
): Promise<{ message?: string }> {
  // Do not rewrite or reinterpret legacy signed links in an architecture PR.
  return client(options).post(API_ENDPOINTS.refereeReject(candidateId, referenceIndex), undefined, publicRequest);
}
export async function browserMagicMembershipInfo<T>(
  options: BrowserIdentityTransport, invitationToken: string,
): Promise<T> {
  return client(options).get<T>(API_ENDPOINTS.magicMembershipInfo(invitationToken), undefined, publicRequest);
}
export async function browserSubmitMagicMembership(
  options: BrowserIdentityTransport, invitationToken: string, payload: Record<string, unknown>, signedIn: boolean,
) {
  const url = API_ENDPOINTS.magicMembershipApply(invitationToken);
  return signedIn
    ? fetchApi(url, { method: 'POST', body: payload })
    : client(options).post(url, payload, publicRequest);
}
export async function browserSessionCurrentUser(
  options: BrowserIdentityTransport, accessToken?: string | null,
): Promise<CurrentUserApi | null> {
  try {
    // A stalled identity check would leave the dashboard hidden: time it out so the Reconnect prompt shows.
    return await client(options, 'include', accessToken).get<CurrentUserApi>('/users/me/', undefined, {
      auth: Boolean(accessToken), retryAuth: false, signal: AbortSignal.timeout(20000),
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw new Error('Your account is temporarily unavailable.');
  }
}
export async function browserWebSocketTicket(options: BrowserIdentityTransport, accessToken: string): Promise<string | null> {
  const data = await client(options, 'same-origin', accessToken).post<{ ticket?: string }>(
    '/users/ws-ticket/', {}, { auth: true, retryAuth: false },
  );
  return data?.ticket ?? null;
}
export function browserPublicTalentFeed(options: BrowserIdentityTransport, page: number, pageSize = 200) {
  return client(options).get<Collection<ExplorerPostApi>>('/explorer-posts/public-feed/', {
    page, page_size: pageSize,
  }, publicRequest);
}
