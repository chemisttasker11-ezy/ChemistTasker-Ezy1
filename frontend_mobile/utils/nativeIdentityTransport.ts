import apiClient from './apiClient';
import { Platform } from 'react-native';
import { browserLoginSession, NATIVE_IDENTITY_ROUTES } from '@chemisttasker/shared-core';
import { resolveApiBaseUrl } from './apiUrl';

/**
 * Expo-only Axios compatibility boundary. The established interceptor owns
 * native secure credentials, platform labels, Expo-web CSRF, 401 refresh,
 * request timeout and error shapes; shared-core owns auth endpoint paths.
 * Intentionally retains AxiosResponse.data contract for legacy consumers.
 */
export const nativeIdentityTransport = {
  currentUser: () => apiClient.get(NATIVE_IDENTITY_ROUTES.me),
  login: async (email: string, password: string) => {
    const payload = { email, password };
    if (Platform.OS === 'web') return { data: await browserLoginSession({ baseUrl: resolveApiBaseUrl() || '' }, payload) };
    return apiClient.post(NATIVE_IDENTITY_ROUTES.login, payload, { withCredentials: true });
  },
  register: (payload: unknown) => apiClient.post(NATIVE_IDENTITY_ROUTES.register, payload),
  verifyEmailOtp: (email: string | undefined, otp: string) =>
    apiClient.post(NATIVE_IDENTITY_ROUTES.verifyEmailOtp, { email, otp }),
  resendEmailOtp: (email: string | undefined) =>
    apiClient.post(NATIVE_IDENTITY_ROUTES.resendEmailOtp, { email }),
};
