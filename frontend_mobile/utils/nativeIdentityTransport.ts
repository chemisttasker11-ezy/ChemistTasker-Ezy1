import apiClient from './apiClient';
import { NATIVE_IDENTITY_ROUTES } from '@chemisttasker/shared-core';

/**
 * Expo-only Axios compatibility boundary. The established interceptor owns
 * native secure credentials, platform labels, Expo-web CSRF, 401 refresh,
 * request timeout and error shapes; shared-core owns auth endpoint paths.
 * Intentionally retains AxiosResponse.data contract for legacy consumers.
 */
export const nativeIdentityTransport = {
  currentUser: () => apiClient.get(NATIVE_IDENTITY_ROUTES.me),
  login: (email: string, password: string) =>
    apiClient.post(NATIVE_IDENTITY_ROUTES.login, { email, password }, { withCredentials: true }),
  register: (payload: unknown) => apiClient.post(NATIVE_IDENTITY_ROUTES.register, payload),
  verifyEmailOtp: (email: string | undefined, otp: string) =>
    apiClient.post(NATIVE_IDENTITY_ROUTES.verifyEmailOtp, { email, otp }),
  resendEmailOtp: (email: string | undefined) =>
    apiClient.post(NATIVE_IDENTITY_ROUTES.resendEmailOtp, { email }),
};
