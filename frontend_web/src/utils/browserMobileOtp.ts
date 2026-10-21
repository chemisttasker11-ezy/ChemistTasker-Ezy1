import apiClient from './apiClient';
import { API_ENDPOINTS } from '@chemisttasker/shared-core';

/**
 * Vite browser-only mobile-identity compatibility adapter.
 * Retains the exact Axios interceptor for credential cookies, CSRF bootstrap
 * on no Bearer token, browser refresh and 401 logout. Shared-core owns routes.
 * The screen owns its own post-verify navigation and presentation.
 */
export async function verifyBrowserMobileOtp(otp: string) {
  const response = await apiClient.post(API_ENDPOINTS.mobileVerifyOtp, { otp });
  return response.data;
}
